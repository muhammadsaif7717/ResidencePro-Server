const express = require('express');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const app = express();
require('dotenv').config();
const cors = require('cors');
const cookieParser = require('cookie-parser');
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const jwt = require('jsonwebtoken');
const port = process.env.PORT || 5000;

// middlewares
app.use(cors({
    origin: ['http://localhost:5173'],
    credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

// custom middlewares
const logger = async (req, res, next) => {
    console.log('Called', req.host, req.originalUrl);
    next();
};

const verifyToken = async (req, res, next) => {
    const token = req.cookies?.token;
    if (!token) {
        return res.status(401).send({ message: 'unauthorized access' });
    }
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
            console.log(err);
            return res.status(401).send({ message: 'unauthorized access' });
        }
        req.user = decoded;
        next();
    });
};

// verify admin after verify token
const verifyAdmin = async (req, res, next) => {
    const email = req.user.email;
    const query = { email: email };
    const user = await userCollection.findOne(query);
    let isAdmin = user?.role === 'admin';
    if (!isAdmin) {
        return res.status(403).send({ message: 'Forbidden access' });
    }
    next();
};

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.oh0s98i.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});


let userCollection;
let roomCollection;
let agreementCollection;
async function run() {
    try {
        userCollection = client.db("ResidenceProDB").collection("users");
        roomCollection = client.db("ResidenceProDB").collection("rooms");
        agreementCollection = client.db("ResidenceProDB").collection("agreements");


        //post agreement
        app.post('/agreements', async (req, res) => {
            res.send(await agreementCollection.insertOne(req.body));
        });

        //get agreements
        app.get('/agreements', async (req, res) => {
            res.send(await agreementCollection.find(req.body).toArray());
        })

        // accept agreement
        app.put('/agreements/:id/accept', async (req, res) => {
            const id = req.params.id;
            // Update the status of the agreement to 'checked'
            const result = await agreementCollection.updateOne(
                { _id: new ObjectId(id) },
                { $set: { status: 'checked' } }
            );

            if (result.modifiedCount > 0) {
                // Find the updated agreement
                const agreement = await agreementCollection.findOne({ _id: new ObjectId(id) });
                if (agreement) {
                    // Check the user's current role
                    const user = await userCollection.findOne({ email: agreement.userEmail });
                    if (user && user.role !== 'admin') {
                        // Update the user's role to 'member' if they are not an admin
                        await userCollection.updateOne(
                            { email: agreement.userEmail },
                            {
                                $set: {
                                    role: 'member',
                                    acceptDate: new Date(),
                                }
                            }
                        );
                    }
                    // Delete the agreement from the agreementCollection
                    await agreementCollection.deleteOne({ _id: new ObjectId(id) });
                }
                res.send({ success: true });
            }
        });

        // reject agreement
        app.put('/agreements/:id/reject', async (req, res) => {
            const id = req.params.id;
            // Update the status of the agreement to 'checked'
            const result = await agreementCollection.updateOne(
                { _id: new ObjectId(id) },
                { $set: { status: 'checked' } }
            );

            if (result.modifiedCount > 0) {
                // Find the updated agreement
                const agreement = await agreementCollection.findOne({ _id: new ObjectId(id) });
                if (agreement) {
                    // Delete the agreement from the agreementCollection
                    await agreementCollection.deleteOne({ _id: new ObjectId(id) });
                }
                res.send({ success: true });
            }
        });




        // AUTH related API
        app.post('/jwt', async (req, res) => {
            const user = req.body;
            console.log(user);
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
            res.cookie('token', token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
            }).send({ success: true });
        });

        // if invallid token then clear jwt
        app.post('/clear-jwt', (req, res) => {
            res.clearCookie('token', {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
            }).send({ success: true });
        });

        // post user if not existing user
        app.post('/users', async (req, res) => {
            const user = req.body;
            const emailQuery = { email: user.email };
            const existingUser = await userCollection.findOne(emailQuery);
            // if (existingUser) {
            //     return res.status(403).send({ message: 'User already Exists' });
            // }
            if (!existingUser) {
                const result = await userCollection.insertOne(user);
                res.send({ result });
            }
        });


        // get all users
        app.get('/users', async (req, res) => {
            res.send(await userCollection.find(req.body).toArray());
        });


        // Demote a user's role to 'user' by email
        app.put('/users/:email/demote', verifyToken, verifyAdmin, async (req, res) => {
            const email = req.params.email;
            // Find the user by email
            const user = await userCollection.findOne({ email: email });

            if (user) {
                // Check if the user is not an admin
                if (user.role !== 'admin') {
                    // Update the user's role to 'user'
                    const result = await userCollection.updateOne(
                        { email: email },
                        {
                            $set: {
                                role: 'user',
                                acceptDate: '',
                            }
                        }
                    );

                    if (result.modifiedCount > 0) {
                        res.send({ success: true, message: 'User role updated to user' });
                    }
                }
            }
        });



        // check if user is a admin
        app.get('/users/admin/:email', verifyToken, async (req, res) => {
            const email = req.params.email;
            if (email !== req.user.email) {
                return res.status(403).send({ message: 'Forbidden access' });
            }
            const query = { email: email };
            const user = await userCollection.findOne(query);
            let admin = false;
            if (user) {
                admin = user?.role === 'admin';
            }
            res.send({ admin });
        });

        // check if user is a member
        app.get('/users/member/:email', verifyToken, async (req, res) => {
            const email = req.params.email;
            if (email !== req.user.email) {
                return res.status(403).send({ message: 'Forbidden access' });
            }
            const query = { email: email };
            const user = await userCollection.findOne(query);
            let member = false;
            if (user) {
                member = user?.role === 'member';
            }
            res.send({ member });
        });


        // get all rooms
        app.get('/rooms', logger, async (req, res) => {
            // console.log('user in the valid token', req.user);
            // if (req.query.email !== req.user.email) {
            //     return res.status(403).send({ message: 'forbidden access' });
            // }
            // let query = {};
            // if (req.query?.email) {
            //     query = { email: req.query.email };
            // }
            res.send(await roomCollection.find(req.body).toArray());
        });









        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('Server is running');
});
app.listen(port, () => {
    console.log(`Server is running on port: ${port}`);
});
