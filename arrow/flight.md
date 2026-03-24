Directory structure:
└── src/
    ├── arrow_util.ts
    ├── async_util.test.ts
    ├── async_util.ts
    ├── client.ts
    ├── flight.ts
    ├── flightsql.ts
    ├── grpc_util.ts
    ├── index.ts
    └── generated/
        ├── any.d.ts
        └── any.js


Files Content:

================================================
FILE: src/arrow_util.ts
================================================
import { AsyncRecordBatchStreamReader, Schema } from "apache-arrow";

import { arrow } from "./generated/flight";
import { Stream } from "./grpc_util";
import { RecordBatchStreamReader } from "apache-arrow";
import { pipe, filter, map } from "iter-ops";

/**
 * An async iterator of Arrow record batches that also has a schema.
 */
export class RecordBatchStream {
  private batches: AsyncRecordBatchStreamReader;
  /**
   * The schema of the record batches.
   */
  schema: Schema;

  constructor(batches: AsyncRecordBatchStreamReader, schema: Schema) {
    this.batches = batches;
    this.schema = schema;
  }

  // Creates an IPC stream message from a FlightData message.
  //
  // Note: this introduces a data copy.  It would be better to avoid this.
  // However, this will require changes to the Arrow package (I think) to allow for
  // the header and body to be in separate buffers.
  private static createIpcMessage(data: arrow.flight.protocol.IFlightData): Uint8Array {
    if (!data.dataHeader || !data.dataBody) {
      throw new Error("Data header or body missing");
    }

    const headerLength = data.dataHeader.length;
    const padBytes = (8 - (headerLength & 7)) & 7;

    // TODO: Avoid copy
    const ipcMessage = new Uint8Array(8 + data.dataHeader?.length + padBytes + data.dataBody?.length);
    // Continuation header
    ipcMessage[0] = 0xff;
    ipcMessage[1] = 0xff;
    ipcMessage[2] = 0xff;
    ipcMessage[3] = 0xff;
    // Header length
    new DataView(ipcMessage.buffer, 4, 4).setInt32(0, headerLength, true);
    // Header
    ipcMessage.set(data.dataHeader!, 8);
    // Pad bytes
    ipcMessage.fill(0, 8 + data.dataHeader?.length, 8 + data.dataHeader?.length + padBytes);
    // Body
    ipcMessage.set(data.dataBody!, data.dataHeader?.length + 8 + padBytes);

    return ipcMessage;
  }

  /**
   * Creates a new RecordBatchStream from a Flight data stream.
   * @param dataStream A stream of FlightData messages
   * @param schema The schema of the stream
   * @returns A RecordBatchStream
   */
  public static async create(
    dataStream: Stream<arrow.flight.protocol.IFlightData, arrow.flight.protocol.IFlightData>,
    schema: Schema,
  ): Promise<RecordBatchStream> {
    // RecordBatchStreamReader doesn't know how to read flight data but it does know how to read an IPC
    // stream and flight data is close enough.
    // We create an async iterator of byte buffers and then create a RecordBatchStreamReader from that.
    const messages = pipe(
      dataStream.responses,
      filter((envelope) => !!envelope.data),
      map((envelope) => this.createIpcMessage(envelope.data!)),
    );

    const batches = await RecordBatchStreamReader.from(messages);

    return new RecordBatchStream(batches, schema);
  }

  // This marks the class as an async iterable.
  public [Symbol.asyncIterator]() {
    return this.batches[Symbol.asyncIterator]();
  }
}



================================================
FILE: src/async_util.test.ts
================================================
import { beforeEach, describe, expect, test } from "@jest/globals";

import { lastValueFrom, firstValueFrom } from "./async_util";

describe("given an async iterable", () => {
  class CustomIterable {
    returned = false;
    value = 0;

    [Symbol.asyncIterator]() {
      return this;
    }

    async next() {
      if (this.value < 3) {
        const val = this.value;
        this.value += 1;
        return {
          done: false,
          value: val,
        };
      } else {
        return {
          done: true,
          value: undefined,
        };
      }
    }

    async return(value: unknown) {
      this.returned = true;
      return {
        done: true,
        value: value,
      };
    }
  }

  let customIterable: CustomIterable;
  beforeEach(() => {
    customIterable = new CustomIterable();
  });

  test("can grab last value", async () => {
    const last = await lastValueFrom(customIterable);
    expect(last).toBe(2);
    // We don't return early if we're grabbing the last value since the iterator exhausts
    // normally.
    expect(customIterable.returned).toBe(false);
  });

  test("can grab first value", async () => {
    const first = await firstValueFrom(customIterable);
    // firstValueFrom should call `return` on the iterator, this is important because
    // we want to cancel an underlying GRPC call if we've stopped listening to it
    expect(first).toBe(0);
    expect(customIterable.returned).toBe(true);
  });
});



================================================
FILE: src/async_util.ts
================================================
class Deferred<T> {
  public resolve!: (value: T | PromiseLike<T>) => void;
  public reject!: (reason?: unknown) => void;
  public promise = new Promise<T>((resolve, reject) => {
    this.resolve = resolve;
    this.reject = reject;
  });
}

interface Result<T> {
  error?: unknown;
  value?: T;
}

// An unbounded channel for bridging pull-based and push-based async code
export class SimpleChannel<T> {
  private waitingToDeliver: Result<T>[] = [];
  private waitingToFulfill: Deferred<IteratorResult<T>>[] = [];
  private closed = false;
  private onCancel: (() => void) | null = null;

  constructor(onCancel: (() => void) | null) {
    this.onCancel = onCancel;
  }

  next(): Promise<IteratorResult<T>> {
    // We have queued results, deliver those
    if (this.waitingToDeliver.length !== 0) {
      const next = this.waitingToDeliver.shift()!;
      if (next.error) {
        return Promise.reject(next.error);
      } else {
        return Promise.resolve({
          value: next.value!,
          done: false,
        });
      }
    }

    // No queued results and no more are coming, we must be done
    if (this.closed) {
      return Promise.resolve({
        done: true,
        value: undefined,
      });
    }

    // No queued results, but more may be coming, queue up a promise
    const deferred = new Deferred<IteratorResult<T>>();
    this.waitingToFulfill.push(deferred);
    return deferred.promise;
  }

  push(value: T): void {
    if (this.closed) {
      // Don't waste buffer space if no one is listening
      return;
    }
    // Someone is already waiting for this value, deliver it to them
    if (this.waitingToFulfill.length !== 0) {
      this.waitingToFulfill.shift()!.resolve({
        value,
        done: false,
      });
    } else {
      // No one is waiting for the value yet, queue it up
      this.waitingToDeliver.push({ value });
    }
  }

  push_err(err: unknown): void {
    if (this.closed) {
      // Don't waste buffer space if no one is listening
      return;
    }
    // Someone is already waiting for this value, deliver it to them
    if (this.waitingToFulfill.length !== 0) {
      this.waitingToFulfill.shift()!.reject(err);
    } else {
      // No one is waiting for the value yet, queue it up
      this.waitingToDeliver.push({ error: err });
    }
  }

  [Symbol.asyncIterator]() {
    return this;
  }

  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    for (const deferred of this.waitingToFulfill) {
      deferred.resolve({
        done: true,
        value: undefined,
      });
    }
    this.waitingToFulfill = [];
  }

  doCancel(): void {
    this.closed = true;
    if (this.onCancel) {
      this.onCancel();
    }
  }

  async return(value?: T): Promise<IteratorResult<T>> {
    this.doCancel();
    return {
      done: true,
      value: value!,
    };
  }

  async throw(): Promise<IteratorResult<T>> {
    this.doCancel();
    return {
      done: true,
      value: undefined,
    };
  }
}

export async function lastValueFrom<T>(iterable: AsyncIterable<T>): Promise<T | undefined> {
  let last: T | undefined;
  for await (const value of iterable) {
    last = value;
  }
  return last;
}

export async function firstValueFrom<T>(iterable: AsyncIterable<T>): Promise<T | undefined> {
  for await (const value of iterable) {
    // Returning from the for/await loop early should trigger JS to call `return` on the iterator
    // and this will cancel any underlying GRPC call so we don't waste time listening for more results
    // in the background.
    return value;
  }
  return undefined;
}



================================================
FILE: src/client.ts
================================================
import { RecordBatchStream } from "./arrow_util";
import { FlightSqlClient } from "./flightsql";
import { arrow as fsql } from "./generated/flightsql";
import { RecordBatch } from "apache-arrow";
import { pipe, toArray } from "iter-ops";

/**
 * Options for creating a new client.
 */
export interface ClientOptions {
  /**
   * The host and port to connect to, separated by a colon
   */
  host: string;
  /**
   * The username to login as
   */
  username: string;
  /**
   * The password to login with
   */
  password: string;
  /**
   * The default database to use (non-standard, only supported on some servers)
   */
  defaultDatabase?: string;
  /**
   * Is the server using TLS?  If not, this must be set to true.
   */
  insecure?: boolean;
}

/**
 * A query to execute.
 */
export interface Query {
  /**
   * The SQL text to execute
   */
  text: string;
  /**
   * The values to bind to the query
   */
  values: unknown[];
}

/**
 * The result of a query.
 *
 * The result data can be fetched in a variety of formats.  In most cases, if the returned data is reasonably
 * small, it is best to use `collectToObjects` to get the data as an array of plain JS objects.
 */
export class QueryResult {
  private raw: RecordBatchStream;

  constructor(raw: RecordBatchStream) {
    this.raw = raw;
  }

  /**
   * Convert the result to a stream of Arrow record batches.
   *
   * Warning: The Arrow package uses a number of `instanceof` checks to determine the type of objects.  For
   * these to work correctly, the Arrow package your application is using  must be the exact same version
   * used by this package.  In addition, the Arrow package must be loaded in the same context as this package.
   * This process can often fail in the presence of bundlers like Webpack or Rollup.
   *
   * If you are using a bundler, it is recommended to use `collectToObjects` instead.
   *
   * @returns a stream of Arrow record batches
   */
  public toArrowStream(): AsyncIterable<RecordBatch> {
    return this.raw;
  }

  /**
   * Consume all results into an array of Arrow record batches.
   *
   * Warning: @see toArrowStream for details on the Arrow package versioning requirements.
   * Warning: This will fully consume the stream, so if the stream is large, this may consume a lot of memory.
   * @returns an array of Arrow record batches
   */
  public async collectToArrow(): Promise<RecordBatch[]> {
    const batches = await pipe(this.raw, toArray()).first;
    return batches ?? [];
  }

  /**
   * Consume all results into an array of plain JS objects.
   *
   * Warning: This will fully consume the stream, so if the stream is large, this may consume a lot of memory.
   * @returns an array of plain JS objects
   */
  public async collectToObjects(): Promise<unknown[]> {
    const collectedBatches = await this.collectToArrow();
    const batchesOfRows = collectedBatches.map((batch) => batch.toArray());
    if (batchesOfRows.length == 0) {
      return [];
    } else if (batchesOfRows.length == 1) {
      return batchesOfRows[0];
    } else {
      const first = batchesOfRows[0];
      const rest = batchesOfRows.slice(1);
      return first.concat(...rest);
    }
  }
}

/**
 * A client for executing SQL queries against a Flight SQL server.
 */
export class Client {
  private sql: FlightSqlClient;

  private constructor(sql: FlightSqlClient) {
    this.sql = sql;
  }

  /**
   * Connect to a Flight SQL server.
   * @param options client options to use for connection
   * @returns A client that can be used to execute queries
   */
  public static async connect(options: ClientOptions): Promise<Client> {
    const sql = await FlightSqlClient.connect(
      options.host,
      options.username,
      options.password,
      options.defaultDatabase,
    );
    return new Client(sql);
  }

  /**
   * Query the server with an SQL statement.
   *
   * Note: only read-only queries are supported.
   *
   * @param sql the SQL statement to execute
   * @returns the result of the query
   */
  public async query(sql: string): Promise<QueryResult> {
    const query: fsql.flight.protocol.sql.ICommandStatementQuery = {
      query: sql,
    };
    const batches = await this.sql.statementQuery(query);
    return new QueryResult(batches);
  }
}



================================================
FILE: src/flight.ts
================================================
import {
  loadPackageDefinition,
  GrpcObject,
  ServiceClientConstructor,
  credentials,
  Metadata as GrpcMetadata,
} from "@grpc/grpc-js";
import { loadSync, Long } from "@grpc/proto-loader";
import { arrow } from "./generated/flight";
import { RecordBatchStreamReader, Schema } from "apache-arrow";
import { Bidirectional, Stream } from "./grpc_util";
import { RecordBatchStream } from "./arrow_util";

// When developing we load files from ../protos
// In production we load files from the same directory as JS files
const PROTO_PATHS = [__dirname + "/../protos", __dirname];

/**
 * A FlightInfo describes the schema and location of a flight.
 */
export class FlightInfo implements arrow.flight.protocol.IFlightInfo {
  private inner: arrow.flight.protocol.IFlightInfo;
  private decodedSchema_?: Schema;

  constructor(inner: arrow.flight.protocol.IFlightInfo) {
    this.inner = inner;
  }

  /**
   * The schema of the flight, decoded from the schema buffer into an Arrow Schema object.
   */
  public get decodedSchema(): Schema | null {
    if (!this.decodedSchema_) {
      if (!this.schema) {
        return null;
      }
      const reader = RecordBatchStreamReader.from(this.schema);
      const batches = reader.readAll();
      this.decodedSchema_ = batches[0].schema;
    }
    return this.decodedSchema_;
  }

  /**
   * The raw schema data for the flight.
   *
   * @see {@link decodedSchema} for the schema as an Arrow Schema object.
   */
  public get schema(): Uint8Array | null | undefined {
    return this.inner.schema;
  }

  /**
   * The descriptor for the flight.
   *
   * This is generally the same as the descriptor used to get the flight info in the first place.
   */
  public get flightDescriptor(): arrow.flight.protocol.IFlightDescriptor | null | undefined {
    return this.inner.flightDescriptor;
  }

  /**
   * The endpoints for the flight.
   *
   * These describe where the data can be retrieved and may include a "ticket" which will be
   * required to actually retrieve the data.
   */
  public get endpoint(): arrow.flight.protocol.IFlightEndpoint[] | null | undefined {
    return this.inner.endpoint;
  }

  /**
   * The total number of records in the flight, if known in advance
   */
  public get totalRecords(): number | Long | null | undefined {
    return this.inner.totalRecords;
  }

  /**
   * The total number of bytes in the flight, if known in advance
   */
  public get totalBytes(): number | Long | null | undefined {
    return this.inner.totalBytes;
  }

  /**
   * Whether the data in the flight is ordered or not, if known
   */
  public get ordered(): boolean | null | undefined {
    return this.inner.ordered;
  }

  /**
   * The application-specific metadata for the flight, if any
   */
  public get appMetadata(): Uint8Array | null | undefined {
    return this.inner.appMetadata;
  }
}

/**
 * A client for the Arrow Flight protocol.
 */
export class FlightClient {
  private protoDescriptor: GrpcObject;
  // TODO: Figure out why protobuf gen is not generating correct method signatures for FlightService
  // It doesn't seem to support streaming methods and types them all as RPCUnary.  For now we just use
  // any to avoid the type errors.

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private client: any;
  private default_metadata: Record<string, string>;

  /**
   * Create a new FlightClient.
   *
   * No actual messages are sent yet.
   *
   * @param host The hostname / port of the server, separated by a colon
   */
  public constructor(host: string) {
    const packageDefinition = loadSync("Flight.proto", {
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
      includeDirs: PROTO_PATHS,
    });
    this.protoDescriptor = loadPackageDefinition(packageDefinition);
    this.default_metadata = {};
    const arrow = this.protoDescriptor.arrow as GrpcObject;
    const flight = arrow.flight as GrpcObject;
    const flight_protocol = flight.protocol as GrpcObject;
    const flight_service = flight_protocol.FlightService as ServiceClientConstructor;
    this.client = new flight_service(
      host,
      credentials.createInsecure(),
      {},
    ) as unknown as arrow.flight.protocol.FlightService;
  }

  // Merges any call-specific metadata with the client's default metadata
  private get_metadata(custom_metadata?: Record<string, string>): GrpcMetadata {
    const metadata = new GrpcMetadata();
    for (const key in this.default_metadata) {
      metadata.set(key, this.default_metadata[key]);
    }
    if (custom_metadata) {
      for (const key in custom_metadata) {
        metadata.set(key, custom_metadata[key]);
      }
    }
    return metadata;
  }

  /**
   * Sets the default metadata to be sent on all calls.
   *
   * Typically this is the authorization token.
   * @param metadata The metadata to send
   */
  public set_default_metadata(metadata: Record<string, string>): void {
    this.default_metadata = metadata;
  }

  /**
   * Execute a handshake with the server.
   * @param metadata Call specific metadata to send
   * @returns A bidirectional stream of handshake messages
   */
  public handshake(
    metadata: Record<string, string>,
  ): Bidirectional<
    arrow.flight.protocol.IHandshakeRequest,
    arrow.flight.protocol.IHandshakeResponse,
    arrow.flight.protocol.IHandshakeResponse
  > {
    const call = this.client.handshake(this.get_metadata(metadata));
    return new Bidirectional(call, arrow.flight.protocol.HandshakeRequest.encode);
  }

  /**
   * Get info about a flight.
   * @param descriptor Describes the flight to get info about (i.e. path or command)
   * @returns The flight info
   */
  public async getFlightInfo(descriptor: arrow.flight.protocol.IFlightDescriptor): Promise<FlightInfo> {
    return new Promise((resolve, reject) => {
      this.client.getFlightInfo(
        descriptor,
        this.get_metadata(),
        (err: unknown, info: arrow.flight.protocol.IFlightInfo) => {
          if (err) {
            reject(err);
          }
          resolve(new FlightInfo(info));
        },
      );
    });
  }

  /**
   * Retrieve the data for a flight.
   * @param ticket A ticket, obtained by an earlier call to getFlightInfo
   * @param schema The expected schema of the data
   * @returns A stream of record batches
   */
  public async doGet(ticket: arrow.flight.protocol.ITicket, schema: Schema): Promise<RecordBatchStream> {
    const call = this.client.doGet(ticket, this.get_metadata());
    const rawStream = new Stream<arrow.flight.protocol.IFlightData, arrow.flight.protocol.IFlightData>(call);
    return await RecordBatchStream.create(rawStream, schema);
  }
}



================================================
FILE: src/flightsql.ts
================================================
import { RecordBatchStream } from "./arrow_util";
import { FlightClient } from "./flight";

import { arrow } from "./generated/flight";
import { arrow as fsql } from "./generated/flightsql";
import { google } from "./generated/any";
import { firstValueFrom } from "./async_util";

// Some quick duck-typing to state what we expect from protobuf messages
interface WriterLike {
  finish(): Uint8Array;
}

// Some quick duck-typing to state what we expect from protobuf messages
// (used in FlightSqlClient.packAny)
interface MessageLike {
  getTypeUrl(prefix?: string): string;
  encode(message: unknown): WriterLike;
}

/**
 * A client for the Flight SQL API.
 */
export class FlightSqlClient {
  private flight: FlightClient;

  // Use the static connect method to create a new instance.
  private constructor(flight: FlightClient) {
    this.flight = flight;
  }

  private async login(username: string, password: string, defaultDatabase?: string): Promise<void> {
    // Most servers seem to use Basic auth for the handshake to get a token.
    // The GRPC headers (and not the handshake request / response) are used to
    // transmit the username, password, and token.
    const auth = "Basic " + btoa(username + ":" + password);
    const call = this.flight.handshake({
      authorization: auth,
    });
    // This seems pretty much unused by the server but we send it anyways
    const hello: arrow.flight.protocol.IHandshakeRequest = {
      payload: new Uint8Array(),
      protocolVersion: 0,
    };
    call.send(hello);
    try {
      // The method is defined as a streaming method but all instances I've encountered so far send
      // a single response.
      //
      // The logic here is maybe not ideal.  If a server someone sends an empty metadata message and then
      // a populated data payload message, then we will see the empty payload message first and fail to
      // wait for the next message.  We can optimize this later if we see it in the wild.
      const helloRsp = await firstValueFrom(call.responses);

      const defaultMetadata = {};
      if (defaultDatabase) {
        defaultMetadata["database"] = defaultDatabase;
      }

      if (helloRsp?.data?.payload) {
        // If we get a payload prefer that as a token
        const payload = new TextDecoder().decode(helloRsp.data.payload);
        defaultMetadata["authorization"] = "Bearer " + payload;
        this.flight.set_default_metadata(defaultMetadata);
      } else if (helloRsp?.metadata) {
        // Otherwise if we get metadata then use that as the token
        const authorization = helloRsp.metadata.get_first_string("authorization");
        if (!authorization) {
          throw new Error("Handshake failed, metadata received but no authorization header present");
        }
        defaultMetadata["authorization"] = authorization;
        this.flight.set_default_metadata(defaultMetadata);
      } else {
        throw new Error("Handshake failed, no metadata or data received from server before call completed");
      }
    } finally {
      // Since we are only taking the first value we should cancel just in case the sender is trying
      // to send more values.
      //
      // TODO: Investigate if this is redundant.  firstValueFrom should call the return method on the
      // iterator which should cancel the call.
      call.cancel();
    }
  }

  /**
   * Connect to a Flight SQL server.
   *
   * This method will perform a handshake with the server and return a client that can be used to
   * execute queries.
   *
   * @param host The hostname / port of the server, separated by a colon
   * @param username The username to use for the handshake
   * @param password The password to use for the handshake
   * @returns A client that can be used to execute queries
   */
  public static async connect(
    host: string,
    username: string,
    password: string,
    defaultDatabase?: string,
  ): Promise<FlightSqlClient> {
    const sql = new FlightClient(host);
    const client = new FlightSqlClient(sql);
    await client.login(username, password, defaultDatabase);
    return client;
  }

  // Helper method to create a protobuf Any message
  private static packAny(message: MessageLike, thing: unknown): Uint8Array {
    const packed: google.protobuf.IAny = {
      typeUrl: message.getTypeUrl(),
      value: message.encode(thing).finish(),
    };
    return google.protobuf.Any.encode(packed).finish();
  }

  // A "command" is a type of Flight descriptor that has no path.  FlightSQL makes frequent use of these.
  private static makeCmd(message: MessageLike, thing: unknown): arrow.flight.protocol.IFlightDescriptor {
    const cmd = FlightSqlClient.packAny(message, thing);
    return {
      type: arrow.flight.protocol.FlightDescriptor.DescriptorType.CMD,
      cmd,
    };
  }

  /**
   * Query the server with an SQL statement.
   * @param query the query to send
   * @returns a stream of record batches that contain the results of the query
   */
  public async statementQuery(query: fsql.flight.protocol.sql.ICommandStatementQuery): Promise<RecordBatchStream> {
    const cmd = FlightSqlClient.makeCmd(fsql.flight.protocol.sql.CommandStatementQuery, query);

    // We first call getFlightInfo to "start the query" and then call doGet to get the actual data.
    const ticket_call = await this.flight.getFlightInfo(cmd);
    const schema = ticket_call.decodedSchema;

    if (!schema) {
      throw new Error("No schema provided by server");
    }

    if (!ticket_call.endpoint) {
      throw new Error("No endpoint provided by server");
    }
    if (ticket_call.endpoint.length !== 1) {
      throw new Error("Expected exactly one endpoint");
    }
    const endpoint = ticket_call.endpoint[0];
    if (endpoint.location && endpoint.location.length > 0) {
      throw new Error("Cannot handle remote location: " + endpoint.location);
    }

    if (!endpoint.ticket) {
      throw new Error("No ticket provided by server");
    }
    const ticket = endpoint.ticket;

    return this.flight.doGet(ticket, schema);
  }
}



================================================
FILE: src/grpc_util.ts
================================================
import { Metadata as GrpcMetadata } from "@grpc/grpc-js";
import { SimpleChannel } from "./async_util";
import { Writer } from "protobufjs";

// Utilities for working with GRPC

/**
 * Wrapper around GRPC Metadata to make it easier to work with and reduce the
 * amount of GRPC-specific code in the rest of the application.
 */
export class Metadata {
  inner: GrpcMetadata;

  /**
   * Create a new Metadata object.
   * @param inner the GRPC Metadata object to wrap.
   */
  constructor(inner: GrpcMetadata) {
    this.inner = inner;
  }

  /**
   * Get all values for a given key.
   * @param key the key to get values for.
   * @returns an array of values for the key.
   */
  public get(key: string): (string | Buffer)[] {
    return this.inner.get(key);
  }

  /**
   * Get the first value for a given key.
   * @param key the key to get the value for.
   * @returns the first value for the key, or null if the key does not exist.
   */
  public get_first_instance(key: string): string | Buffer | null {
    const values = this.inner.get(key);
    if (values.length > 0) {
      return values[0];
    } else {
      return null;
    }
  }

  /**
   * Get the first value for a given key as a string.
   * @param key the key to get the value for.
   * @param encoding the encoding to use when converting the value to a string (defaults to UTF-8)
   * @returns the first value for the key as a string, or null if the key does not exist.
   */
  get_first_string(key: string, encoding?: BufferEncoding): string | null {
    const value = this.get_first_instance(key);
    if (value) {
      if (Buffer.isBuffer(value)) {
        return value.toString(encoding);
      } else {
        return value;
      }
    } else {
      return null;
    }
  }
}

/**
 * Messages from GRPC can be data or metadata. This type represents a message
 * that can be either.
 *
 * Only one of the data or metadata fields will be set.
 */
export interface Envelope<O> {
  data?: O;
  metadata?: Metadata;
}

/**
 * A stream of messages from a GRPC call.
 *
 * This converts GRPC's push-style API to a pull-style API creating a channel
 * that can be read as an async iterator.
 *
 * An optional messageDecoder can be provided to convert the GRPC messages to
 * the desired output type.  If not used then GrpcOutput and StreamOutput should
 * be the same type.
 *
 * @param GrpcOutput the type of messages received from the GRPC call.
 * @param StreamOutput the type of messages that will be returned by the stream.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export class Stream<GrpcOutput, StreamOutput> {
  responses_: SimpleChannel<Envelope<StreamOutput>>;

  /**
   * Cancel the GRPC call.
   *
   * If this is not called, but the stream is not fully consumed, the GRPC call
   * will continue to run in the background.
   */
  public cancel(): void {
    this.call.cancel();
  }

  /**
   * An async iterator that yields messages from the GRPC call.
   */
  get responses(): AsyncIterable<Envelope<StreamOutput>> {
    return this.responses_;
  }

  protected call: any;
  private messageDecoder?: (msg: GrpcOutput) => StreamOutput;

  constructor(call: any, messageDecoder?: (msg: GrpcOutput) => StreamOutput) {
    this.call = call;
    this.messageDecoder = messageDecoder;
    this.responses_ = new SimpleChannel<Envelope<StreamOutput>>(() => call.cancel());
    call.on("data", (data: any) => {
      if (this.messageDecoder) {
        data = this.messageDecoder(data);
      }
      this.responses_.push({ data });
    });
    call.on("status", (status: { code: number; metadata: GrpcMetadata }) => {
      if (status.code === 0) {
        this.responses_.push({ metadata: new Metadata(status.metadata) });
      }
    });
    call.on("metadata", (metadata: GrpcMetadata) => {
      this.responses_.push({ metadata: new Metadata(metadata) });
    });
    call.on("error", (error: any) => {
      this.responses_.push_err(error);
    });
    call.on("end", () => {
      this.responses_.close();
    });
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * A bidirectional stream of messages to and from a GRPC call.
 *
 * This is the same as Stream, but with an additional send method to send
 * messages to the GRPC call.
 *
 * A messageEncoder is required to convert the messages to the format expected
 * by the GRPC call. (typically this is the encode method from the protobufjs
 * generated message type).
 *
 * @param StreamInput the type of messages that will be sent to the GRPC call.
 * @param GrpcOutput the type of messages received from the GRPC call.
 * @param StreamOutput the type of messages that will be returned by the stream.
 */
export class Bidirectional<StreamInput, GrpcOutput, StreamOutput> extends Stream<GrpcOutput, StreamOutput> {
  /**
   * Send a message to the GRPC call.
   * @param item the message to send.
   */
  public send(item: StreamInput): void {
    this.call.write(this.messageEncoder(item));
  }

  private messageEncoder: (msg: StreamInput) => Writer;

  constructor(
    call: unknown,
    messageEncoder: (msg: StreamInput) => Writer,
    messageDecoder?: (msg: GrpcOutput) => StreamOutput,
  ) {
    super(call, messageDecoder);
    this.messageEncoder = messageEncoder;
  }
}



================================================
FILE: src/index.ts
================================================
export { Client, ClientOptions, QueryResult } from "./client";



================================================
FILE: src/generated/any.d.ts
================================================
import * as $protobuf from "protobufjs";
import Long = require("long");
/** Namespace google. */
export namespace google {

    /** Namespace protobuf. */
    namespace protobuf {

        /** Properties of an Any. */
        interface IAny {

            /** Any typeUrl */
            typeUrl?: (string|null);

            /** Any value */
            value?: (Uint8Array|null);
        }

        /** Represents an Any. */
        class Any implements IAny {

            /**
             * Constructs a new Any.
             * @param [properties] Properties to set
             */
            constructor(properties?: google.protobuf.IAny);

            /** Any typeUrl. */
            public typeUrl: string;

            /** Any value. */
            public value: Uint8Array;

            /**
             * Creates a new Any instance using the specified properties.
             * @param [properties] Properties to set
             * @returns Any instance
             */
            public static create(properties?: google.protobuf.IAny): google.protobuf.Any;

            /**
             * Encodes the specified Any message. Does not implicitly {@link google.protobuf.Any.verify|verify} messages.
             * @param message Any message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encode(message: google.protobuf.IAny, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Encodes the specified Any message, length delimited. Does not implicitly {@link google.protobuf.Any.verify|verify} messages.
             * @param message Any message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encodeDelimited(message: google.protobuf.IAny, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes an Any message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns Any
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): google.protobuf.Any;

            /**
             * Decodes an Any message from the specified reader or buffer, length delimited.
             * @param reader Reader or buffer to decode from
             * @returns Any
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): google.protobuf.Any;

            /**
             * Verifies an Any message.
             * @param message Plain object to verify
             * @returns `null` if valid, otherwise the reason why it is not
             */
            public static verify(message: { [k: string]: any }): (string|null);

            /**
             * Creates an Any message from a plain object. Also converts values to their respective internal types.
             * @param object Plain object
             * @returns Any
             */
            public static fromObject(object: { [k: string]: any }): google.protobuf.Any;

            /**
             * Creates a plain object from an Any message. Also converts values to other types if specified.
             * @param message Any
             * @param [options] Conversion options
             * @returns Plain object
             */
            public static toObject(message: google.protobuf.Any, options?: $protobuf.IConversionOptions): { [k: string]: any };

            /**
             * Converts this Any to JSON.
             * @returns JSON object
             */
            public toJSON(): { [k: string]: any };

            /**
             * Gets the default type url for Any
             * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns The default type url
             */
            public static getTypeUrl(typeUrlPrefix?: string): string;
        }
    }
}



================================================
FILE: src/generated/any.js
================================================
/*eslint-disable block-scoped-var, id-length, no-control-regex, no-magic-numbers, no-prototype-builtins, no-redeclare, no-shadow, no-var, sort-vars*/
"use strict";

var $protobuf = require("protobufjs/minimal");

// Common aliases
var $Reader = $protobuf.Reader, $Writer = $protobuf.Writer, $util = $protobuf.util;

// Exported root namespace
var $root = $protobuf.roots["default"] || ($protobuf.roots["default"] = {});

$root.google = (function() {

    /**
     * Namespace google.
     * @exports google
     * @namespace
     */
    var google = {};

    google.protobuf = (function() {

        /**
         * Namespace protobuf.
         * @memberof google
         * @namespace
         */
        var protobuf = {};

        protobuf.Any = (function() {

            /**
             * Properties of an Any.
             * @memberof google.protobuf
             * @interface IAny
             * @property {string|null} [typeUrl] Any typeUrl
             * @property {Uint8Array|null} [value] Any value
             */

            /**
             * Constructs a new Any.
             * @memberof google.protobuf
             * @classdesc Represents an Any.
             * @implements IAny
             * @constructor
             * @param {google.protobuf.IAny=} [properties] Properties to set
             */
            function Any(properties) {
                if (properties)
                    for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null)
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * Any typeUrl.
             * @member {string} typeUrl
             * @memberof google.protobuf.Any
             * @instance
             */
            Any.prototype.typeUrl = "";

            /**
             * Any value.
             * @member {Uint8Array} value
             * @memberof google.protobuf.Any
             * @instance
             */
            Any.prototype.value = $util.newBuffer([]);

            /**
             * Creates a new Any instance using the specified properties.
             * @function create
             * @memberof google.protobuf.Any
             * @static
             * @param {google.protobuf.IAny=} [properties] Properties to set
             * @returns {google.protobuf.Any} Any instance
             */
            Any.create = function create(properties) {
                return new Any(properties);
            };

            /**
             * Encodes the specified Any message. Does not implicitly {@link google.protobuf.Any.verify|verify} messages.
             * @function encode
             * @memberof google.protobuf.Any
             * @static
             * @param {google.protobuf.IAny} message Any message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            Any.encode = function encode(message, writer) {
                if (!writer)
                    writer = $Writer.create();
                if (message.typeUrl != null && Object.hasOwnProperty.call(message, "typeUrl"))
                    writer.uint32(/* id 1, wireType 2 =*/10).string(message.typeUrl);
                if (message.value != null && Object.hasOwnProperty.call(message, "value"))
                    writer.uint32(/* id 2, wireType 2 =*/18).bytes(message.value);
                return writer;
            };

            /**
             * Encodes the specified Any message, length delimited. Does not implicitly {@link google.protobuf.Any.verify|verify} messages.
             * @function encodeDelimited
             * @memberof google.protobuf.Any
             * @static
             * @param {google.protobuf.IAny} message Any message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            Any.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes an Any message from the specified reader or buffer.
             * @function decode
             * @memberof google.protobuf.Any
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {google.protobuf.Any} Any
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            Any.decode = function decode(reader, length) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                var end = length === undefined ? reader.len : reader.pos + length, message = new $root.google.protobuf.Any();
                while (reader.pos < end) {
                    var tag = reader.uint32();
                    switch (tag >>> 3) {
                    case 1: {
                            message.typeUrl = reader.string();
                            break;
                        }
                    case 2: {
                            message.value = reader.bytes();
                            break;
                        }
                    default:
                        reader.skipType(tag & 7);
                        break;
                    }
                }
                return message;
            };

            /**
             * Decodes an Any message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof google.protobuf.Any
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {google.protobuf.Any} Any
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            Any.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Verifies an Any message.
             * @function verify
             * @memberof google.protobuf.Any
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            Any.verify = function verify(message) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (message.typeUrl != null && message.hasOwnProperty("typeUrl"))
                    if (!$util.isString(message.typeUrl))
                        return "typeUrl: string expected";
                if (message.value != null && message.hasOwnProperty("value"))
                    if (!(message.value && typeof message.value.length === "number" || $util.isString(message.value)))
                        return "value: buffer expected";
                return null;
            };

            /**
             * Creates an Any message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof google.protobuf.Any
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {google.protobuf.Any} Any
             */
            Any.fromObject = function fromObject(object) {
                if (object instanceof $root.google.protobuf.Any)
                    return object;
                var message = new $root.google.protobuf.Any();
                if (object.typeUrl != null)
                    message.typeUrl = String(object.typeUrl);
                if (object.value != null)
                    if (typeof object.value === "string")
                        $util.base64.decode(object.value, message.value = $util.newBuffer($util.base64.length(object.value)), 0);
                    else if (object.value.length >= 0)
                        message.value = object.value;
                return message;
            };

            /**
             * Creates a plain object from an Any message. Also converts values to other types if specified.
             * @function toObject
             * @memberof google.protobuf.Any
             * @static
             * @param {google.protobuf.Any} message Any
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            Any.toObject = function toObject(message, options) {
                if (!options)
                    options = {};
                var object = {};
                if (options.defaults) {
                    object.typeUrl = "";
                    if (options.bytes === String)
                        object.value = "";
                    else {
                        object.value = [];
                        if (options.bytes !== Array)
                            object.value = $util.newBuffer(object.value);
                    }
                }
                if (message.typeUrl != null && message.hasOwnProperty("typeUrl"))
                    object.typeUrl = message.typeUrl;
                if (message.value != null && message.hasOwnProperty("value"))
                    object.value = options.bytes === String ? $util.base64.encode(message.value, 0, message.value.length) : options.bytes === Array ? Array.prototype.slice.call(message.value) : message.value;
                return object;
            };

            /**
             * Converts this Any to JSON.
             * @function toJSON
             * @memberof google.protobuf.Any
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            Any.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * Gets the default type url for Any
             * @function getTypeUrl
             * @memberof google.protobuf.Any
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            Any.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/google.protobuf.Any";
            };

            return Any;
        })();

        return protobuf;
    })();

    return google;
})();

module.exports = $root;


