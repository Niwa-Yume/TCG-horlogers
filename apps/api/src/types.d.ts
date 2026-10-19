declare module 'passport-discord' {
  import { Strategy as OAuth2Strategy } from 'passport-oauth2';
  export class Strategy extends OAuth2Strategy {
    constructor(options: Record<string, unknown>, verify: (...args: never[]) => void);
  }
}
