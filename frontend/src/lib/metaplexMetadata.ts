/**
 * Utilities for creating and updating Metaplex Token Metadata
 * Works with existing mints to add metadata (name, symbol, URI)
 * 
 * Note: Creating metadata requires complex serialization. For production use,
 * consider using @metaplex-foundation/js or external services like HoneyChain/CoinFactory.
 * This is a simplified implementation.
 */

import { Connection, PublicKey, Transaction, SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";

// Metaplex Token Metadata Program ID
export const METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

/**
 * Derive Metadata PDA for a mint address
 */
export function getMetadataPDA(mintAddress: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("metadata"),
      METADATA_PROGRAM_ID.toBuffer(),
      mintAddress.toBuffer(),
    ],
    METADATA_PROGRAM_ID
  );
}

/**
 * Serialize metadata data according to Metaplex format
 */
function serializeMetadataData(name: string, symbol: string, uri: string): Buffer {
  const nameBuffer = Buffer.from(name, "utf8");
  const symbolBuffer = Buffer.from(symbol, "utf8");
  const uriBuffer = Buffer.from(uri, "utf8");
  
  // Calculate total size
  const dataSize = 4 + nameBuffer.length + 4 + symbolBuffer.length + 4 + uriBuffer.length + 2 + 1 + 4;
  const buffer = Buffer.alloc(dataSize);
  let offset = 0;
  
  // Write name (4 bytes length + string)
  buffer.writeUInt32LE(nameBuffer.length, offset);
  offset += 4;
  nameBuffer.copy(buffer, offset);
  offset += nameBuffer.length;
  
  // Write symbol (4 bytes length + string)
  buffer.writeUInt32LE(symbolBuffer.length, offset);
  offset += 4;
  symbolBuffer.copy(buffer, offset);
  offset += symbolBuffer.length;
  
  // Write URI (4 bytes length + string)
  buffer.writeUInt32LE(uriBuffer.length, offset);
  offset += 4;
  uriBuffer.copy(buffer, offset);
  offset += uriBuffer.length;
  
  // Write seller_fee_basis_points (2 bytes, 0)
  buffer.writeUInt16LE(0, offset);
  offset += 2;
  
  // Write creators (1 byte: Option<Vec<Creator>>, null = 0)
  buffer.writeUInt8(0, offset);
  offset += 1;
  
  // Write collection (4 bytes: Option<Collection>, null = 0)
  buffer.writeUInt32LE(0, offset);
  
  return buffer;
}

/**
 * Create instruction to create metadata account for existing mint
 * Note: This is a simplified version. For production, use Metaplex SDK or external services.
 */
export async function createCreateMetadataInstruction(
  connection: Connection,
  mintAddress: PublicKey,
  updateAuthority: PublicKey,
  name: string,
  symbol: string,
  uri: string
) {
  const [metadataPDA] = getMetadataPDA(mintAddress);
  
  // Serialize metadata data
  const dataBuffer = serializeMetadataData(name, symbol, uri);
  
  // Calculate account size: key(1) + update_authority(32) + mint(32) + data
  const accountSize = 1 + 32 + 32 + dataBuffer.length;
  
  // Get rent exemption
  const rentExemption = await connection.getMinimumBalanceForRentExemption(accountSize);
  
  // Create the instruction data manually
  // Instruction discriminator for CreateMetadataAccountV3 is [33, 104, 72, 227, 143, 77, 155, 152]
  const instructionData = Buffer.alloc(1 + 8 + accountSize);
  instructionData[0] = 33; // Instruction discriminator (simplified)
  
  // For a complete implementation, you'd need to properly serialize the instruction
  // This is a placeholder - in production, use Metaplex SDK
  
  throw new Error(
    "Direct metadata creation is complex. Please use external services like:\n" +
    "- HoneyChain: https://docs.honeychain.online/ru/solana/update-token\n" +
    "- CoinFactory: https://coinfactory.app/ru/solana/update-metadata\n" +
    "Or install @metaplex-foundation/js for programmatic creation."
  );
}

/**
 * Create instruction to update existing metadata
 */
export async function createUpdateMetadataInstruction(
  connection: Connection,
  mintAddress: PublicKey,
  updateAuthority: PublicKey,
  name: string,
  symbol: string,
  uri: string
) {
  // Similar to create, but for updates
  // This also requires proper serialization
  throw new Error(
    "Direct metadata update is complex. Please use external services or Metaplex SDK."
  );
}

/**
 * Check if metadata already exists for a mint
 */
export async function metadataExists(
  connection: Connection,
  mintAddress: PublicKey
): Promise<boolean> {
  try {
    const [metadataPDA] = getMetadataPDA(mintAddress);
    const accountInfo = await connection.getAccountInfo(metadataPDA);
    return accountInfo !== null;
  } catch (error) {
    return false;
  }
}

