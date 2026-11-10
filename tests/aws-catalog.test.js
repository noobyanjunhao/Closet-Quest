import test from 'node:test';
import {experiment} from '../scripts/experiment-aws-catalog.mjs';
test('official AWS SDK interoperates with local DynamoDB emulator across independent clients',experiment);

