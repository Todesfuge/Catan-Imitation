declare module "node:fs" {
  export function existsSync(path: string): boolean;
  export function readFileSync(path: string, encoding: string): string;
  export function readdirSync(path: string, options: { recursive: true }): string[];
  export function readdirSync(path: string): string[];
}
