const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const { ethers } = require('ethers');
const { gcclient } = require('@gala-chain/client');
const { RegisterUserDto, FetchBalancesDto, FetchAllowancesDto, CreateTokenClassDto, MintTokenDto, GrantAllowanceDto, TokenInstance, TokenInstanceKey, createValidDTO } = require('@gala-chain/api');
const { networkInterfaces } = require('os');
const NETWORK_ROOT = path.resolve(__dirname, '../../Galachain_API_Boilerplate/galachain');
const adminPrivateKey = '62172f65ecab45f423f7088128eee8946c5b3c03911cb0b061b1dd9032337271';

const app = express();
app.use(bodyParser.json());

async function getPublicKeyClient() {
    try {
        const params = {
            orgMsp: 'CuratorOrg',
            userId: 'admin',
            userSecret: 'adminpw',
            apiUrl: 'http://localhost:8801',
            configPath: path.resolve(NETWORK_ROOT, 'api-config.json'),
        };
        const publicKeyContract = {
            channelName: 'product-channel',
            chaincodeName: 'basic-product',
            contractName: 'PublicKeyContract',
        };
        const client = gcclient.forApiConfig(params).forContract(publicKeyContract);
        console.log("PublicKey client initialized:", client);
        return client;
    } catch (error) {
        console.error("Error initializing PublicKey client:", error);
        throw error;
    }
}

async function getTokenContractClient() {
    try {
        const params = {
            orgMsp: 'CuratorOrg',
            userId: 'admin',
            userSecret: 'adminpw',
            apiUrl: 'http://localhost:8801',
            configPath: path.resolve(NETWORK_ROOT, 'api-config.json'),
        };
        const tokenContract = {
            channelName: 'product-channel',
            chaincodeName: 'basic-product',
            contractName: 'GalaChainToken',
        };
        const client = gcclient.forApiConfig(params).forContract(tokenContract);
        console.log("Token contract client initialized:", client);
        return client;
    } catch (error) {
        console.error("Error initializing Token contract client:", error);
        throw error;
    }
}

app.get('/test-client', async (req, res) => {
    try {
        const client = await getPublicKeyClient();
        res.json({ success: true, message: 'Client configured successfully', clientDetails: client });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to configure client', error: error.message });
    }
});

app.post('/registerUser', async (req, res) => {
    try {
        const { user } = req.body;
        const wallet = ethers.Wallet.createRandom();
        const publicKey = wallet.publicKey;
        console.log(req.body);
        console.log(publicKey);
        if (!user || user.trim() === '' || !publicKey || publicKey.trim() === '') {
            return res.status(400).json({
                success: false,
                message: "'user' must be provided and cannot be empty."
            });
        }
        const client = await getPublicKeyClient();
        const dto = await createValidDTO(
            RegisterUserDto,
            {
                user,
                publicKey,
            },
        );
        const response = await client.submitTransaction('RegisterUser', dto.signed(adminPrivateKey));
        res.json({ success: true, data: response });
    } catch (error) {
        console.error("Error registering user:", error);
        res.status(500).json({ success: false, message: "Internal server error", error: error.message });
    }
});

app.post('/createTokenClass', async (req, res) => {
    try {
        const {
            network, tokenClass, isNonFungible, decimals, name, symbol, description,
            rarity, image, metadataAddress, contractAddress, maxSupply, maxCapacity,
            totalMintAllowance, totalSupply, totalBurned
        } = req.body;

        // Construct and validate the DTO
        const dtoData = {
            network, 
            tokenClass, 
            isNonFungible, 
            decimals, 
            name, 
            symbol, 
            description,
            rarity, 
            image, 
            metadataAddress, 
            contractAddress, 
            maxSupply: maxSupply.toString(), // Ensure numbers are passed as strings if needed
            maxCapacity: maxCapacity.toString(),
            totalMintAllowance: totalMintAllowance.toString(),
            totalSupply: totalSupply.toString(),
            totalBurned: totalBurned.toString()
        };

        const client = await getTokenContractClient();
        if (!client) {
            return res.status(500).json({ success: false, message: "Failed to initialize blockchain client." });
        }

        const dto = await createValidDTO(CreateTokenClassDto, dtoData);
        const signedDto = dto.signed(adminPrivateKey); // Ensure this method exists or implement it
        const response = await client.submitTransaction('CreateTokenClass', signedDto);
        res.json({ success: true, data: response });
    } catch (error) {
        console.error("Error creating token class:", error);
        res.status(500).json({ success: false, message: "Internal server error", error: error.message });
    }
});

app.post('/grantAllowance', async (req, res) => {
    try {
        const {
            collection, category, type, additionalKey, allowanceType, quantities, uses
        } = req.body;

        // Validate input
        if (!collection || !category || !type || !additionalKey || !allowanceType || !quantities || !uses) {
            return res.status(400).json({
                success: false,
                message: "Missing required fields: 'collection', 'category', 'type', 'additionalKey', 'allowanceType', 'quantities', and 'uses' must all be provided."
            });
        }

        const tokenInstanceKey = TokenInstanceKey.nftKey({
            collection,
            category,
            type,
            additionalKey
        }, TokenInstance.FUNGIBLE_TOKEN_INSTANCE).toQueryKey();

        // Construct and validate the DTO
        const dtoData = {
            tokenInstance: tokenInstanceKey, 
            allowanceType, 
            quantities: quantities.map(q => ({
                user: "client|admin",
                quantity: q.quantity.toString() // Ensure quantities are passed as strings if needed
            })),
            uses: uses.toString()
        };

        const client = await getTokenContractClient();
        if (!client) {
            return res.status(500).json({ success: false, message: "Failed to initialize blockchain client." });
        }

        const dto = await createValidDTO(GrantAllowanceDto, dtoData);
        const signedDto = dto.signed(adminPrivateKey);
        const response = await client.submitTransaction('GrantAllowance', signedDto);
        res.json({ success: true, data: response });
    } catch (error) {
        console.error("Error in granting allowance:", error);
        res.status(500).json({ success: false, message: "Internal server error", error: error.message });
    }
});

app.post('/mintToken', async (req, res) => {
    try {
        const { tokenClassKey, owner, quantity } = req.body; // Adjust these parameters based on what your smart contract expects

        if (!tokenClassKey || !owner || quantity == null) {
            return res.status(400).json({
                success: false,
                message: "Missing required fields: 'tokenClassKey', 'owner', and 'quantity' must be provided."
            });
        }

        const client = await getTokenContractClient();
        const dto = await createValidDTO(MintTokenDto, {
            tokenClass: tokenClassKey,
            owner,
            quantity: quantity.toString()
        });

        const signedDto = dto.signed(adminPrivateKey);
        const response = await client.submitTransaction('MintToken', signedDto);
        res.json({ success: true, data: response });
    } catch (error) {
        console.error("Error creating token instance:", error);
        res.status(500).json({ success: false, message: "Internal server error", error: error.message });
    }
});

app.get('/getBalances', async (req, res) => {
    try {
        const { userId } = req.query;  // Assuming the user ID is passed as a query parameter
        if (!userId) {
            return res.status(400).json({ success: false, message: "User ID is required." });
        }

        const client = await getTokenContractClient();
        if (!client) {
            return res.status(500).json({ success: false, message: "Failed to initialize blockchain client." });
        }

        // Assuming 'FetchBalances' is a smart contract function that needs a user ID
        const dto = await createValidDTO(FetchBalancesDto, { owner: userId });
        const signedDto = dto.signed(adminPrivateKey);
        const balance = await client.evaluateTransaction('FetchBalances', signedDto);

        res.json({ success: true, data: balance });
    } catch (error) {
        console.error("Error fetching balances:", error);
        res.status(500).json({ success: false, message: "Internal server error", error: error.message });
    }
});

app.get('/getAllowances', async (req, res) => {
    try {
        const { tokenInstanceKey, user, grantedTo } = req.query;  // Now including 'grantedTo'

        if (!tokenInstanceKey || !user || !grantedTo) { // Check for 'grantedTo' is also necessary
            return res.status(400).json({
                success: false,
                message: "All parameters (tokenInstanceKey, user, grantedTo) must be provided."
            });
        }

        const client = await getTokenContractClient();
        if (!client) {
            return res.status(500).json({ success: false, message: "Failed to initialize blockchain client." });
        }

        // Update the DTO creation to include 'grantedTo'
        const dto = await createValidDTO(FetchAllowancesDto, { tokenInstanceKey, user, grantedTo });
        const signedDto = dto.signed(adminPrivateKey);
        const allowance = await client.evaluateTransaction('FetchAllowances', signedDto);

        res.json({ success: true, data: allowance });
    } catch (error) {
        console.error("Error fetching allowance:", error);
        res.status(500).json({ success: false, message: "Internal server error", error: error.message });
    }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html')); // Assuming you save the above HTML in an `index.html` file in the same directory as your server script.
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
