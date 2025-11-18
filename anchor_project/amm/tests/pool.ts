import * as anchor from "@coral-xyz/anchor";
import {Program} from "@coral-xyz/anchor";
import {Amm} from "../target/types/amm";
import {Keypair, PublicKey, SystemProgram} from "@solana/web3.js";
import {assert} from "chai";
import {
    ASSOCIATED_TOKEN_PROGRAM_ID,
    createAssociatedTokenAccount,
    getAccount,
    getAssociatedTokenAddressSync,
    getMint,
    mintTo,
    TOKEN_PROGRAM_ID
} from "@solana/spl-token";
import {airdrop, createAmm, createMintSafe, createPool, indexToSeed} from "./helper";

describe("pool", () => {
    anchor.setProvider(anchor.AnchorProvider.env());
    let connection = anchor.getProvider().connection;

    const program = anchor.workspace.amm as Program<Amm>;

    let signer = Keypair.generate();
    let signer2 = Keypair.generate();
    let admin1 = Keypair.generate();

    const mintA = Keypair.generate();
    const mintB = Keypair.generate();
    const mintC = Keypair.generate();
    const mintD = Keypair.generate();

    before(async () => {
        await airdrop(connection, signer.publicKey);
        await airdrop(connection, signer2.publicKey);
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
            const {ammPda} = await createAmm(program, signer, admin1.publicKey, fee, ammIndex1);
            const {poolPda} = await createPool(program, signer, ammPda, mintA.publicKey, mintB.publicKey);

            const poolData = await program.account.ammPool.fetch(poolPda);
            assert.strictEqual(poolData.amm.toBase58(), ammPda.toBase58(), `Pool AMM should be "${ammPda.toBase58()}" but was "${poolData.amm.toBase58()}"`);
            assert.strictEqual(poolData.mintA.toBase58(), mintA.publicKey.toBase58(), `Pool mintA should be "${mintA.publicKey.toBase58()}" but was "${poolData.mintA.toBase58()}"`);
            assert.strictEqual(poolData.mintB.toBase58(), mintB.publicKey.toBase58(), `Pool mintB should be "${mintB.publicKey.toBase58()}" but was "${poolData.mintB.toBase58()}"`);
        });

        it("Cannot create pool with same tokens", async () => {
            const {ammPda} = await createAmm(program, signer, admin1.publicKey, fee, ammIndex2);

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
                }).signers([signer]).rpc({commitment: "confirmed"});

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
                }).signers([signer]).rpc({commitment: "confirmed"});

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
});

