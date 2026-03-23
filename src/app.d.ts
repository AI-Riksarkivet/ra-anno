/// <reference types="@sveltejs/kit" />

declare global {
  namespace App {
    // interface Error {}
    // interface Locals {}
    // interface PageData {}
    // interface PageState {}
    // interface Platform {}
  }

  // Deno runtime globals — available in server routes
  const Deno: {
    readFile(path: string): Promise<Uint8Array>;
    readTextFile(path: string): Promise<string>;
    writeFile(path: string, data: Uint8Array): Promise<void>;
    stat(path: string): Promise<{ isFile: boolean; size: number }>;
    cwd(): string;
  };
}

export {};
