/**
 * Type declarations for pouchdb-browser
 * Uses the pouchdb types from @types/pouchdb
 */

declare module "pouchdb-browser" {
  import PouchDB from "pouchdb-core";
  const plugin: PouchDB.Static;
  export = plugin;
}
