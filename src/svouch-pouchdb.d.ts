/**
 * Type declarations for @svouch/pouchdb
 * This package wraps pouchdb-browser for Vite compatibility
 */
declare module "@svouch/pouchdb" {
  import PouchDBCore from "pouchdb-core";

  export const PouchDB: PouchDBCore.Static;
  export const find: PouchDBCore.Plugin;
  export const liveFind: PouchDBCore.Plugin;
}
