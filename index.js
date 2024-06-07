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
async function run() {
    try {
        userCollection = client.db("ResidenceProDB").collection("users");
        roomCollection = client.db("ResidenceProDB").collection("rooms");

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

        // get all rooms
        app.get('/rooms', logger, verifyToken, async (req, res) => {
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
