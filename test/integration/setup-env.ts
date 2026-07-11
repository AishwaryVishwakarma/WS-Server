import {config} from 'dotenv';
import {resolve} from 'path';

// Load the integration test environment before any application code runs.
// `override: true` ensures test values beat both the shell environment and
// the dev .env that ConfigModule would otherwise read (process.env has
// precedence in @nestjs/config).
config({path: resolve(__dirname, '../../.env.test'), override: true});
