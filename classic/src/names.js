import { pick } from './rng.js';

const GIVEN = [
  'Aldric', 'Brenna', 'Cassian', 'Dorin', 'Elsa', 'Fenwick', 'Gisela', 'Halvard', 'Ilse', 'Joren',
  'Katrin', 'Leof', 'Maren', 'Niall', 'Odile', 'Piers', 'Quilla', 'Roderic', 'Sabine', 'Tamsin',
  'Ulric', 'Vera', 'Wystan', 'Yara', 'Edda', 'Corwin', 'Liesel', 'Matthias', 'Rowena', 'Sigrun',
  'Anselm', 'Beatrix', 'Conrad', 'Dagny', 'Emeric', 'Freya', 'Gideon', 'Helka', 'Ivo', 'Jutta',
  'Kasimir', 'Lenore', 'Magnus', 'Nadia', 'Osric', 'Petra', 'Reinhold', 'Solveig', 'Theodric', 'Ursula',
];

const START = ['Al', 'Bel', 'Cor', 'Dra', 'El', 'Fen', 'Gal', 'Har', 'Ist', 'Kor', 'Lun', 'Mor', 'Nor', 'Ost',
  'Pel', 'Rav', 'Sel', 'Tor', 'Ul', 'Val', 'Wen', 'Yr', 'Zan', 'Ash', 'Bry', 'Cael', 'Dun', 'Eir', 'Gwyn', 'Thal'];
const MID = ['a', 'e', 'i', 'o', 'ar', 'en', 'or', 'is', 'an', 'el', 'ur', 'am', 'on', ''];
const PLACE_END = ['dor', 'mar', 'wyn', 'gard', 'heim', 'mere', 'vale', 'holm', 'rith', 'stead', 'wick', 'ford',
  'by', 'ton', 'burg', 'moor', 'fell', 'brook', 'crest', 'haven'];
const REALM_END = ['ia', 'or', 'avia', 'esh', 'mark', 'und', 'ara', 'eth', 'onia', 'ica'];
const DYN_END = ['ne', 'ric', 'van', 'mont', 'ley', 'ard', 'ell', 'ock', 'ière', 'sson'];

export const givenName = (s) => pick(s, GIVEN);
export const placeName = (s) => pick(s, START) + pick(s, MID) + pick(s, PLACE_END);
export const realmBase = (s) => pick(s, START) + pick(s, MID) + pick(s, REALM_END);
export const dynastyName = (s) => pick(s, START) + pick(s, MID) + pick(s, DYN_END);
