import { multiDocumentModelOf } from 'soukai-solid/models';
import WebId from './WebId';

const Model = multiDocumentModelOf(WebId, ['seeAlso', 'isPrimaryTopicOf']);

export class MultiDocumentWebId extends Model {}