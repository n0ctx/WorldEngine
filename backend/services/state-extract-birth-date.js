/**
 * state-extract-birth-date.js — AI 提取档案建议时的出生日期。
 *
 * 人设写明了出生日期就照写；只写了年龄时，多问模型一个「世界开场时的年龄」，
 * 再按世界卡的开场日期倒推。年龄只用来推算，不作为建议返回。
 * key 沿用 state-extract.js 给档案字段加的 profile. 前缀。
 */

import { validateValue } from '../utils/state-field-validate.js';
import { parseWorldDate, formatWorldDateOnly, birthDateFromAge } from '../utils/world-date.js';
import { getWorldOpeningDate } from './world-profile-defaults.js';

const BIRTH_DATE_KEY = 'profile.birth_date';
const AGE_KEY = 'profile.age';

/**
 * 卡上有出生日期字段、世界卡有开场日期时，返回要追加给模型的年龄字段及开场日期；
 * 否则返回 null（旧世界、导入的旧卡没有开场日期，不问年龄）。
 */
export function prepareBirthDateAgeInput(profileFields, worldId) {
  const openingDate = profileFields.some((f) => f.field_key === BIRTH_DATE_KEY) && getWorldOpeningDate(worldId);
  if (!openingDate) return null;
  const field = {
    field_key: AGE_KEY,
    label: '身份·年龄',
    type: 'number',
    min_value: 0,
    description: `世界开场日期（${formatWorldDateOnly(openingDate)}）时的年龄，整数；人设写了年龄但没写出生日期时填，用来推算出生日期`,
  };
  return { field, openingDate };
}

/**
 * 去掉年龄，补好出生日期：写明且格式正确的照用；否则按年龄倒推，
 * 月日取开场日期，即开场当天刚满这个年龄，故事里要过满一年才长一岁。
 */
export function resolveBirthDate(suggestions, ageInput) {
  const { [AGE_KEY]: rawAge, ...rest } = suggestions;
  if (parseWorldDate(rest[BIRTH_DATE_KEY])) return rest;
  delete rest[BIRTH_DATE_KEY];
  const birthDate = ageInput && birthDateFromAge(validateValue(rawAge, ageInput.field), ageInput.openingDate);
  if (birthDate) rest[BIRTH_DATE_KEY] = birthDate;
  return rest;
}
