-- Two more asset classes. Purely additive.
ALTER TYPE "HoldingClass" ADD VALUE IF NOT EXISTS 'CRYPTO';
ALTER TYPE "HoldingClass" ADD VALUE IF NOT EXISTS 'COLLECTIBLES';
