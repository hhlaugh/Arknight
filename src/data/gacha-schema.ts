/** 抽卡配置数据契约：与 card-schema.ts 同纪律——描述性 JSON Schema 子集 + 常量白名单，运行时校验在 load-gacha-data.ts。 */

export const GACHA_SCHEMA_VERSION = 1;
export const GACHA_CURRENCIES = ['originite'] as const;
export const GACHA_RARITY_KEYS = ['4', '5', '6'] as const;
export const DECK_MODES = ['collection', 'free'] as const;

export const gachaPoolJsonSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  required: ['schemaVersion', 'pools', 'economy'],
  properties: {
    schemaVersion: { enum: [GACHA_SCHEMA_VERSION] },
    pools: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['poolId', 'label', 'minRarity', 'rates', 'cost', 'pity'],
        properties: {
          poolId: { type: 'string', minLength: 1 },
          label: { type: 'string', minLength: 1 },
          minRarity: { type: 'integer', minimum: 1, maximum: 6 },
          rates: {
            type: 'object',
            required: ['sixStar', 'fiveStar'],
            properties: {
              sixStar: { type: 'number', exclusiveMinimum: 0, exclusiveMaximum: 1 },
              fiveStar: { type: 'number', exclusiveMinimum: 0, exclusiveMaximum: 1 },
            },
          },
          cost: {
            type: 'object',
            required: ['single', 'ten'],
            properties: {
              single: { type: 'integer', minimum: 1 },
              ten: { type: 'integer', minimum: 1 },
            },
          },
          pity: {
            type: 'object',
            required: ['softPityFrom', 'softPityStep', 'hardPityAt'],
            properties: {
              softPityFrom: { type: 'integer', minimum: 2 },
              softPityStep: { type: 'number', exclusiveMinimum: 0, maximum: 1 },
              hardPityAt: { type: 'integer', minimum: 3 },
            },
          },
        },
      },
    },
    economy: {
      type: 'object',
      required: ['currencyId', 'initialOriginite', 'testAccountOriginite', 'battleRewards', 'conversion', 'ownedLimit'],
      properties: {
        currencyId: { enum: GACHA_CURRENCIES },
        initialOriginite: { type: 'integer', minimum: 0 },
        testAccountOriginite: { type: 'integer', minimum: 0 },
        battleRewards: {
          type: 'object',
          required: ['win', 'lose', 'draw'],
          properties: {
            win: { type: 'integer', minimum: 0 },
            lose: { type: 'integer', minimum: 0 },
            draw: { type: 'integer', minimum: 0 },
          },
        },
        conversion: {
          type: 'object',
          required: GACHA_RARITY_KEYS,
          properties: {
            '4': { type: 'integer', minimum: 0 },
            '5': { type: 'integer', minimum: 0 },
            '6': { type: 'integer', minimum: 0 },
          },
        },
        ownedLimit: { type: 'integer', minimum: 1 },
      },
    },
  },
} as const;
