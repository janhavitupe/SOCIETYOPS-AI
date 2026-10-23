-- Onboarding wizard steps an admin skipped for now.
ALTER TABLE "Society" ADD COLUMN "onboardingSkipped" TEXT[] DEFAULT ARRAY[]::TEXT[];
