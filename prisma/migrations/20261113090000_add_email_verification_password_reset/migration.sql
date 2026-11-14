-- Preserve access for accounts created before email verification was introduced.
ALTER TABLE "User"
ADD COLUMN "emailVerifiedAt" TIMESTAMP(3),
ADD COLUMN "emailVerificationOtpHash" TEXT,
ADD COLUMN "emailVerificationOtpExpiresAt" TIMESTAMP(3),
ADD COLUMN "emailVerificationOtpSentAt" TIMESTAMP(3),
ADD COLUMN "emailVerificationOtpAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "passwordResetTokenHash" TEXT,
ADD COLUMN "passwordResetTokenExpiresAt" TIMESTAMP(3),
ADD COLUMN "passwordResetRequestedAt" TIMESTAMP(3);

UPDATE "User" SET "emailVerifiedAt" = CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX "User_passwordResetTokenHash_key"
ON "User"("passwordResetTokenHash");
