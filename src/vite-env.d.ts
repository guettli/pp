/// <reference types="vite/client" />

declare const __BUILD_DATE__: string;

/**
 * TypeScript declarations for Vite's ?raw import suffix.
 * Allows importing YAML files as strings: import data from './file.yaml?raw'
 */
declare module "*.yaml?raw" {
  const content: string;
  export default content;
}
