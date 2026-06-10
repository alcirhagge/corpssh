-- Verificador da senha-mestra. Permite validar a senha-mestra em QUALQUER
-- dispositivo antes de baixar/decifrar segredos (mesmo sem nenhum segredo ainda).
-- É um blob {iv,data} (JSON) resultante de cifrar uma constante conhecida com a
-- chave derivada da senha-mestra. O servidor nunca vê a senha nem a chave.
alter table public.profiles add column if not exists kdf_verifier text;
