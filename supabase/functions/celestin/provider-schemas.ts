export const GEMINI_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    message: { type: 'STRING', description: 'Reponse conversationnelle, toujours presente' },
    ui_action: {
      type: 'OBJECT',
      nullable: true,
      properties: {
        kind: {
          type: 'STRING',
          enum: ['show_recommendations', 'prepare_add_wine', 'prepare_add_wines', 'prepare_log_tasting'],
        },
        payload: {
          type: 'OBJECT',
          properties: {
            cards: {
              type: 'ARRAY',
              nullable: true,
              items: {
                type: 'OBJECT',
                properties: {
                  bottle_id: { type: 'STRING', nullable: true },
                  name: { type: 'STRING' },
                  appellation: { type: 'STRING' },
                  millesime: { type: 'INTEGER', nullable: true },
                  badge: { type: 'STRING' },
                  reason: { type: 'STRING' },
                  color: { type: 'STRING' },
                },
                required: ['name', 'appellation', 'badge', 'reason', 'color'],
              },
            },
            extraction: {
              type: 'OBJECT',
              nullable: true,
              properties: {
                domaine: { type: 'STRING', nullable: true },
                cuvee: { type: 'STRING', nullable: true },
                appellation: { type: 'STRING', nullable: true },
                millesime: { type: 'INTEGER', nullable: true },
                couleur: { type: 'STRING', nullable: true },
                region: { type: 'STRING', nullable: true },
                quantity: { type: 'INTEGER' },
                volume: { type: 'STRING' },
                grape_varieties: { type: 'ARRAY', nullable: true, items: { type: 'STRING' } },
                serving_temperature: { type: 'STRING', nullable: true },
                typical_aromas: { type: 'ARRAY', nullable: true, items: { type: 'STRING' } },
                food_pairings: { type: 'ARRAY', nullable: true, items: { type: 'STRING' } },
                character: { type: 'STRING', nullable: true },
                purchase_price: { type: 'NUMBER', nullable: true },
                drink_from: { type: 'INTEGER', nullable: true, description: 'Annee a partir de laquelle boire' },
                drink_until: { type: 'INTEGER', nullable: true, description: 'Annee limite pour boire' },
                zone_name: { type: 'STRING', nullable: true, description: 'Nom de la zone de stockage choisie par l utilisateur' },
              },
              required: ['domaine', 'cuvee', 'appellation', 'millesime', 'couleur', 'region', 'quantity', 'volume'],
            },
            extractions: {
              type: 'ARRAY',
              nullable: true,
              description: 'Tableau d\'extractions pour ajout batch (prepare_add_wines)',
              items: {
                type: 'OBJECT',
                properties: {
                  domaine: { type: 'STRING', nullable: true },
                  cuvee: { type: 'STRING', nullable: true },
                  appellation: { type: 'STRING', nullable: true },
                  millesime: { type: 'INTEGER', nullable: true },
                  couleur: { type: 'STRING', nullable: true },
                  region: { type: 'STRING', nullable: true },
                  quantity: { type: 'INTEGER' },
                  volume: { type: 'STRING' },
                  grape_varieties: { type: 'ARRAY', nullable: true, items: { type: 'STRING' } },
                  serving_temperature: { type: 'STRING', nullable: true },
                  typical_aromas: { type: 'ARRAY', nullable: true, items: { type: 'STRING' } },
                  food_pairings: { type: 'ARRAY', nullable: true, items: { type: 'STRING' } },
                  character: { type: 'STRING', nullable: true },
                  purchase_price: { type: 'NUMBER', nullable: true },
                  drink_from: { type: 'INTEGER', nullable: true, description: 'Annee a partir de laquelle boire' },
                  drink_until: { type: 'INTEGER', nullable: true, description: 'Annee limite pour boire' },
                },
                required: ['domaine', 'cuvee', 'appellation', 'millesime', 'couleur', 'region', 'quantity', 'volume'],
              },
            },
          },
          required: [],
        },
      },
      required: ['kind', 'payload'],
    },
    action_chips: {
      type: 'ARRAY',
      nullable: true,
      description: '2-3 suggestions contextuelles courtes pour relancer la conversation',
      items: { type: 'STRING' },
    },
  },
  required: ['message'],
}

export const OPENAI_RESPONSE_SCHEMA = {
  name: 'celestin_response',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      message: { type: 'string', description: 'Reponse conversationnelle, toujours presente' },
      ui_action: {
        type: ['object', 'null'],
        properties: {
          kind: {
            type: 'string',
            enum: ['show_recommendations', 'prepare_add_wine', 'prepare_add_wines', 'prepare_log_tasting'],
          },
          payload: {
            type: 'object',
            properties: {
              cards: {
                type: ['array', 'null'],
                items: {
                  type: 'object',
                  properties: {
                    bottle_id: { type: ['string', 'null'] },
                    name: { type: 'string' },
                    appellation: { type: 'string' },
                    millesime: { type: ['integer', 'null'] },
                    badge: { type: 'string' },
                    reason: { type: 'string' },
                    color: { type: 'string' },
                  },
                  required: ['name', 'appellation', 'badge', 'reason', 'color', 'bottle_id', 'millesime'],
                  additionalProperties: false,
                },
              },
              extraction: {
                type: ['object', 'null'],
                properties: {
                  domaine: { type: ['string', 'null'] },
                  cuvee: { type: ['string', 'null'] },
                  appellation: { type: ['string', 'null'] },
                  millesime: { type: ['integer', 'null'] },
                  couleur: { type: ['string', 'null'] },
                  region: { type: ['string', 'null'] },
                  quantity: { type: 'integer' },
                  volume: { type: 'string' },
                },
                required: ['domaine', 'cuvee', 'appellation', 'millesime', 'couleur', 'region', 'quantity', 'volume'],
                additionalProperties: false,
              },
              extractions: {
                type: ['array', 'null'],
                items: {
                  type: 'object',
                  properties: {
                    domaine: { type: ['string', 'null'] },
                    cuvee: { type: ['string', 'null'] },
                    appellation: { type: ['string', 'null'] },
                    millesime: { type: ['integer', 'null'] },
                    couleur: { type: ['string', 'null'] },
                    region: { type: ['string', 'null'] },
                    quantity: { type: 'integer' },
                    volume: { type: 'string' },
                  },
                  required: ['domaine', 'cuvee', 'appellation', 'millesime', 'couleur', 'region', 'quantity', 'volume'],
                  additionalProperties: false,
                },
              },
            },
            required: ['cards', 'extraction', 'extractions'],
            additionalProperties: false,
          },
        },
        required: ['kind', 'payload'],
        additionalProperties: false,
      },
      action_chips: {
        type: ['array', 'null'],
        items: { type: 'string' },
      },
    },
    required: ['message', 'ui_action', 'action_chips'],
    additionalProperties: false,
  },
}

