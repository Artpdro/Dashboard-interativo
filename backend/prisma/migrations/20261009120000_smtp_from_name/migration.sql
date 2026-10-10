-- Nome do remetente exibido nos e-mails (opcional). Alteração aditiva: não afeta dados existentes.
ALTER TABLE "smtp_configs" ADD COLUMN "from_name" TEXT;
