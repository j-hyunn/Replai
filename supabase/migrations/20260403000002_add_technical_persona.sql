ALTER TABLE interview_sessions
  DROP CONSTRAINT interview_sessions_persona_check;

ALTER TABLE interview_sessions
  ADD CONSTRAINT interview_sessions_persona_check
  CHECK (persona = ANY (ARRAY['explorer'::text, 'pressure'::text, 'technical'::text]));

ALTER TABLE user_persona_settings
  DROP CONSTRAINT user_persona_settings_persona_check;

ALTER TABLE user_persona_settings
  ADD CONSTRAINT user_persona_settings_persona_check
  CHECK (persona = ANY (ARRAY['explorer'::text, 'pressure'::text, 'technical'::text]));
