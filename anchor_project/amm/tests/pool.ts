import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Amm } from "../target/types/amm";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { assert } from "chai";
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync, createAssociatedTokenAccount, mintTo, getAccount } from "@solana/spl-token";
import { airdrop, indexToSeed, createMintSafe, createAmm, createPool } from "./helper";

describe("pool", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  let connection = anchor.getProvider().connection;

  const program = anchor.workspace.amm as Program<Amm>;

  let signer = Keypair.generate();
  let admin1 = Keypair.generate();

  const mintA = Keypair.generate();
  const mintB = Keypair.generate();
  const mintC = Keypair.generate();
  const mintD = Keypair.generate();

  before(async () => {
    await airdrop(connection, signer.publicKey);
    await airdrop(connection, admin1.publicKey);

    await createMintSafe(connection, signer, signer.publicKey, 9, mintA);
    await createMintSafe(connection, signer, signer.publicKey, 9, mintB);
    await createMintSafe(connection, signer, signer.publicKey, 9, mintC);
    await createMintSafe(connection, signer, signer.publicKey, 9, mintD);
  });

  beforeEach(async () => {
    await airdrop(connection, signer.publicKey);
  });

  describe("create_pool", async () => {
    const ammIndex1 = 100;
    const ammIndex2 = 101;
    const fee = 100;

    it("Can create pool with different tokens", async () => {
      const { ammPda } = await createAmm(program, signer, admin1.publicKey, fee, ammIndex1);
      const { poolPda } = await createPool(program, signer, ammPda, mintA.publicKey, mintB.publicKey);

      const poolData = await program.account.ammPool.fetch(poolPda);
      assert.strictEqual(poolData.amm.toBase58(), ammPda.toBase58(), `Pool AMM should be "${ammPda.toBase58()}" but was "${poolData.amm.toBase58()}"`);
      assert.strictEqual(poolData.mintA.toBase58(), mintA.publicKey.toBase58(), `Pool mintA should be "${mintA.publicKey.toBase58()}" but was "${poolData.mintA.toBase58()}"`);
      assert.strictEqual(poolData.mintB.toBase58(), mintB.publicKey.toBase58(), `Pool mintB should be "${mintB.publicKey.toBase58()}" but was "${poolData.mintB.toBase58()}"`);
    });

    it("Cannot create pool with same tokens", async () => {
      const { ammPda } = await createAmm(program, signer, admin1.publicKey, fee, ammIndex2);

      const [poolPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("AMM_POOL"),
          ammPda.toBuffer(),
          mintC.publicKey.toBuffer(),
          mintC.publicKey.toBuffer(),
        ],
        program.programId
      );

      const [mintLiquidityPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("AMM_MINT_LIQUIDITY"),
          ammPda.toBuffer(),
          mintC.publicKey.toBuffer(),
          mintC.publicKey.toBuffer(),
        ],
        program.programId
      );

      const [authorityPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("AMM_POOL_AUTHORITY"),
          ammPda.toBuffer(),
          mintC.publicKey.toBuffer(),
          mintC.publicKey.toBuffer(),
        ],
        program.programId
      );

      const poolAccountA = getAssociatedTokenAddressSync(
        mintC.publicKey,
        authorityPda,
        true
      );

      const poolAccountB = getAssociatedTokenAddressSync(
        mintC.publicKey,
        authorityPda,
        true
      );

      try {
        await program.methods.createPool().accounts({
          amm: ammPda,
          pool: poolPda,
          mintLiquidity: mintLiquidityPda,
          poolAccountA: poolAccountA,
          poolAccountB: poolAccountB,
          authority: authorityPda,
          mintA: mintC.publicKey,
          mintB: mintC.publicKey,
          signer: signer.publicKey,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        }).signers([signer]).rpc({ commitment: "confirmed" });
        
        assert.fail("Expected transaction to fail");
      } catch (err) {
        const errorString = err.toString();
        assert.isTrue(
          errorString.includes("Provided owner is not allowed"),
          `Expected "Provided owner is not allowed" error, got: ${errorString}`
        );
      }
    });

    it("Cannot create pool without AMM", async () => {
      const fakeAmmPda = Keypair.generate().publicKey;

      const [poolPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("AMM_POOL"),
          fakeAmmPda.toBuffer(),
          mintD.publicKey.toBuffer(),
          mintA.publicKey.toBuffer(),
        ],
        program.programId
      );

      const [mintLiquidityPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("AMM_MINT_LIQUIDITY"),
          fakeAmmPda.toBuffer(),
          mintD.publicKey.toBuffer(),
          mintA.publicKey.toBuffer(),
        ],
        program.programId
      );

      const [authorityPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("AMM_POOL_AUTHORITY"),
          fakeAmmPda.toBuffer(),
          mintD.publicKey.toBuffer(),
          mintA.publicKey.toBuffer(),
        ],
        program.programId
      );

      const poolAccountA = getAssociatedTokenAddressSync(
        mintD.publicKey,
        authorityPda,
        true
      );

      const poolAccountB = getAssociatedTokenAddressSync(
        mintA.publicKey,
        authorityPda,
        true
      );

      try {
        await program.methods.createPool().accounts({
          amm: fakeAmmPda,
          pool: poolPda,
          mintLiquidity: mintLiquidityPda,
          poolAccountA: poolAccountA,
          poolAccountB: poolAccountB,
          authority: authorityPda,
          mintA: mintD.publicKey,
          mintB: mintA.publicKey,
          signer: signer.publicKey,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        }).signers([signer]).rpc({ commitment: "confirmed" });
        
        assert.fail("Expected transaction to fail");
      } catch (err) {
        const errorString = err.toString();
        assert.isTrue(
          errorString.includes("AccountNotInitialized") || errorString.includes("3012"),
          `Expected AccountNotInitialized error, got: ${errorString}`
        );
      }
    });
  });

  describe("add_liquidity", async () => {
    const ammIndex = 200;
    const fee = 100;

    it("Add liquidity to pool A-B: 100 = 100", async () => {
      const { ammPda } = await createAmm(program, signer, admin1.publicKey, fee, ammIndex);
      const { poolPda: poolPda1, mintLiquidityPda: mintLiquidityPda1 } = await createPool(
        program,
        signer,
        ammPda,
        mintA.publicKey,
        mintB.publicKey
      );

      const depositorAccountA = getAssociatedTokenAddressSync(
        mintA.publicKey,
        signer.publicKey,
        false
      );

      const depositorAccountB = getAssociatedTokenAddressSync(
        mintB.publicKey,
        signer.publicKey,
        false
      );

      const depositorAccountLiquidity = getAssociatedTokenAddressSync(
        mintLiquidityPda1,
        signer.publicKey,
        false
      );

      await createAssociatedTokenAccount(
        connection,
        signer,
        mintA.publicKey,
        signer.publicKey
      );

      await createAssociatedTokenAccount(
        connection,
        signer,
        mintB.publicKey,
        signer.publicKey
      );

      const amountA = 100 * 10 ** 9;
      const amountB = 100 * 10 ** 9;

      await mintTo(connection, signer, mintA.publicKey, depositorAccountA, signer, amountA);
      await mintTo(connection, signer, mintB.publicKey, depositorAccountB, signer, amountB);

      const accountA = await getAccount(connection, depositorAccountA);
      const accountB = await getAccount(connection, depositorAccountB);
      assert.isTrue(accountA.amount >= amountA, "Depositor account A should have enough tokens");
      assert.isTrue(accountB.amount >= amountB, "Depositor account B should have enough tokens");

      await program.methods.addLiquidity(new anchor.BN(amountA), new anchor.BN(amountB)).accounts({
        pool: poolPda1,
        mintA: mintA.publicKey,
        mintB: mintB.publicKey,
        depositor: signer.publicKey,
        depositorAccountA: depositorAccountA,
        depositorAccountB: depositorAccountB,
        payer: signer.publicKey,
      }).signers([signer]).rpc({ commitment: "confirmed" });

      await new Promise(resolve => setTimeout(resolve, 1000));

      const lpAccount = await getAccount(connection, depositorAccountLiquidity);
      const expectedLp = Math.floor(Math.sqrt(amountA * amountB));
      assert.strictEqual(Number(lpAccount.amount), expectedLp, `LP amount should be ${expectedLp} but was ${lpAccount.amount}`);
    });

    it("Add liquidity to pool C-A: 50 = 100", async () => {
      const [ammPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("AMM"), indexToSeed(ammIndex)],
        program.programId
      );
      const ammData = await program.account.amm.fetch(ammPda);
      assert.strictEqual(ammData.index, ammIndex, "AMM should exist from previous test");

      const { poolPda: poolPda2, mintLiquidityPda: mintLiquidityPda2 } = await createPool(
        program,
        signer,
        ammPda,
        mintC.publicKey,
        mintA.publicKey
      );

      const depositorAccountC = getAssociatedTokenAddressSync(
        mintC.publicKey,
        signer.publicKey,
        false
      );

      const depositorAccountA2 = getAssociatedTokenAddressSync(
        mintA.publicKey,
        signer.publicKey,
        false
      );

      const depositorAccountLiquidity2 = getAssociatedTokenAddressSync(
        mintLiquidityPda2,
        signer.publicKey,
        false
      );

      try {
        await createAssociatedTokenAccount(
          connection,
          signer,
          mintC.publicKey,
          signer.publicKey
        );
      } catch (err) {
      }

      const amountC = 50 * 10 ** 9;
      const amountA2 = 100 * 10 ** 9;

      await mintTo(connection, signer, mintC.publicKey, depositorAccountC, signer, amountC);
      await mintTo(connection, signer, mintA.publicKey, depositorAccountA2, signer, amountA2);

      const accountC = await getAccount(connection, depositorAccountC);
      const accountA2 = await getAccount(connection, depositorAccountA2);
      assert.isTrue(accountC.amount >= amountC, "Depositor account C should have enough tokens");
      assert.isTrue(accountA2.amount >= amountA2, "Depositor account A2 should have enough tokens");

      await program.methods.addLiquidity(new anchor.BN(amountC), new anchor.BN(amountA2)).accounts({
        pool: poolPda2,
        mintA: mintC.publicKey,
        mintB: mintA.publicKey,
        depositor: signer.publicKey,
        depositorAccountA: depositorAccountC,
        depositorAccountB: depositorAccountA2,
        payer: signer.publicKey,
      }).signers([signer]).rpc({ commitment: "confirmed" });

      await new Promise(resolve => setTimeout(resolve, 1000));

      const lpAccount2 = await getAccount(connection, depositorAccountLiquidity2);
      const expectedLp2 = Math.floor(Math.sqrt(amountC * amountA2));
      assert.strictEqual(Number(lpAccount2.amount), expectedLp2, `LP amount should be ${expectedLp2} but was ${lpAccount2.amount}`);
    });
  });
});

