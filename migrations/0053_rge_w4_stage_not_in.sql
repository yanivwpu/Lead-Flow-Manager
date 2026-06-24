-- RGE W4: replace narrow stage_in with stage_not_in so Proposal/Open and other active stages enroll.
-- W5/W6 unchanged.

UPDATE workflows
SET trigger_conditions = jsonb_set(
  trigger_conditions::jsonb,
  '{rgeConditions}',
  '[
    {
      "type": "stage_not_in",
      "stages": [
        "Closed",
        "Unqualified",
        "Lost",
        "DNC / Do Not Contact",
        "Do Not Contact"
      ]
    }
  ]'::jsonb
)
WHERE trigger_type = 'no_reply'
  AND trigger_conditions->>'templateKey' = 'W4'
  AND trigger_conditions->>'templateId' = 'realtor-growth-engine';

UPDATE template_assets
SET definition = jsonb_set(
  definition::jsonb,
  '{workflows}',
  (
    SELECT COALESCE(
      jsonb_agg(
        CASE
          WHEN wf->>'key' = 'W4' THEN
            jsonb_set(
              wf,
              '{conditions}',
              '[
                {
                  "type": "stage_not_in",
                  "stages": [
                    "Closed",
                    "Unqualified",
                    "Lost",
                    "DNC / Do Not Contact",
                    "Do Not Contact"
                  ]
                }
              ]'::jsonb
            )
          ELSE wf
        END
        ORDER BY ord
      ),
      definition::jsonb->'workflows'
    )
    FROM jsonb_array_elements(definition::jsonb->'workflows') WITH ORDINALITY AS t(wf, ord)
  )
)
WHERE template_id = 'realtor-growth-engine'
  AND asset_type = 'workflows';
