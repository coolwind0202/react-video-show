import Dexie, { Table } from 'dexie';

export interface Movie {
  id: number;
  name: string;
  fileNameOPFS: string;
}

export class MySubClassedDexie extends Dexie {
  movies!: Table<Movie>; 

  constructor() {
    super('movie-database');
    this.version(1).stores({
      movies: '++id, name, fileNameOPFS'
    });
  }
}

export const db = new MySubClassedDexie();
