import type { Table } from "apache-arrow";

const MAX_UNDO = 50;

class UndoStack {
  private _undoStack: Table[] = [];
  private _redoStack: Table[] = [];
  canUndo = $state(false);
  canRedo = $state(false);

  private sync(): void {
    this.canUndo = this._undoStack.length > 0;
    this.canRedo = this._redoStack.length > 0;
  }

  push(table: Table): void {
    this._undoStack.push(table);
    if (this._undoStack.length > MAX_UNDO) this._undoStack.shift();
    this._redoStack = [];
    this.sync();
  }

  undo(current: Table): Table | null {
    if (this._undoStack.length === 0) return null;
    this._redoStack.push(current);
    const prev = this._undoStack.pop()!;
    this.sync();
    return prev;
  }

  redo(current: Table): Table | null {
    if (this._redoStack.length === 0) return null;
    this._undoStack.push(current);
    const next = this._redoStack.pop()!;
    this.sync();
    return next;
  }

  clear(): void {
    this._undoStack = [];
    this._redoStack = [];
    this.sync();
  }
}

export const undoStack = new UndoStack();
