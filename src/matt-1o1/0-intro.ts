import { Model } from '@/models';

/**
 * Soukai: Active Record library
 * https://soukai.js.org
 * https://github.com/noeldemartin/soukai-solid
 */

class User extends Model {}

const user = await User.create({
    name: 'John Doe',
    age: 20,
});

await user.update({ age: 21 });
