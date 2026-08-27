export {};

declare module 'express-serve-static-core' {
  interface Request {
    id?: string;
    timedout?: boolean;
  }
}
