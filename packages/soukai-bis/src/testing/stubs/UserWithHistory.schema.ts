import { defineSchema } from 'soukai-bis';
import User from 'soukai-bis/testing/stubs/User';

export default defineSchema(User, { history: true });
