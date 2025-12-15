
const express = require("express");
const cors = require("cors");
require("dotenv").config();

// firebase requre

const admin = require("firebase-admin");

const decoded = Buffer.from(process.env.FB_SERVICE_KEY, 'base64').toString('utf8')
const serviceAccount = JSON.parse(decoded);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const app = express();
const port = process.env.PORT || 3000;

// Middleware   dom6fKoSFWGpSCPA
app.use(cors());

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));




// middleware chekk the user valid and authentic user want to data 
const verifyToken = async (req, res, next) => {
  const token = req.headers.authorization
  if (!token) {
    return res.status(401).send({ message: "Unauthorized access" });

  }
  try {
    const tokenId = token.split(" ")[1];
    const decoded = await admin.auth().verifyIdToken(tokenId)
    req.decoded_email = decoded.email
    // console.log("inside of the token",decoded);

    next()
  } catch (err) {

    return res.status(403).send({ message: "unauthoraize access" })
  }


}

// payment chekout part
const stripe = require('stripe')(`${process.env.STRIPE_SECRET}`);

// MongoDB Connection
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.neniktd.mongodb.net/?appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});
// tracking id genarate
function generateTrackingId() {

  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let trackingId = 'TS-';
  for (let i = 0; i < 8; i++) {
    trackingId += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return trackingId;
}


async function run() {
  try {
    // await client.connect();
    // console.log(" Connected to MongoDB");

    const db = client.db("garments-management");
    const userCollection = db.collection("users");
    const ParcelsCollection = db.collection("parcels");
    const paymentHistory = db.collection("payment")
    const riderCollection = db.collection("rider")
    const trakingCollection = db.collection("trakingId")
    const AllproductsCollection = db.collection("allproducts")
    const orderCollection = db.collection("allOrder")


    // midleware chek the user want this data he/she is a admin 
    const veryfyAdmin = async (req, res, next) => {
      const email = req.decoded_email
      const query = { email }
      const user = await userCollection.findOne(query)
      if (!user || user.role != "Admin") {
        return res.status(403).send({ message: "forbiden access" });


      }
      next()
    }
    // manager api secure
    const veryfyManager = async (req, res, next) => {
      const email = req.decoded_email
      const query = { email }
      const user = await userCollection.findOne(query)
      if (!user || user.role != "Manager") {
        return res.status(403).send({ message: "forbiden access" });


      }
      next()
    }
   
    const TrakingLog = async (trackingId, status) => {
      const log = {
        trackingId,
        status,
        details: status.split('_').join(' '),
        createdAt: new Date()
      }
      const result = await trakingCollection.insertOne(log)
      return result

    }

    // Default route
    app.get("/", (req, res) => {
      res.send("garments server API running ");
    });
    // user related api
    // get all user my who is register my website 
    app.get("/user", async (req, res) => {
      const serceUser = req.query.serceUser
      let query = {}
      // console.log(query);

      if (serceUser) {
        query = {
          $or: [
            { displayName: { $regex: serceUser, $options: "i" } },
            { email: { $regex: serceUser, $options: "i" } }
          ]
        };

      }
      const cursor = userCollection.find(query).sort({ createdAt: -1 }).limit(10)
      const result = await cursor.toArray()
      res.send(result)
    })
    //user suspend reason load api navber
    app.get("/users/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const result = await userCollection.findOne({ email });
      res.send(result);
    });


    // get user base his role by this website 
    app.get("/user/:email/role", async (req, res) => {
      const email = req.params.email
      const query = { email }
      const user = await userCollection.findOne(query)
      res.send({ role: user?.role || "user" })
    })
    // when user register garments traking  system page and save his database do simple user
    app.post("/user", async (req, res) => {
      const users = req.body
      const { role } = users;

      users.status = "pending";
      users.suspendReason = "";
      users.role = role
      users.createdAt = new Date()
      const email = users.email
      const userExist = await userCollection.findOne({ email })
      if (userExist) {
        return res.send({ message: "user alredy have an account,user exist" })

      }
      const userData = await userCollection.insertOne(users)
      res.send(userData)
    })


    // patch /updated user role user to admin and admin to simple user (admin)

    app.patch("/user/:id", verifyToken, veryfyAdmin, async (req, res) => {
      const id = req.params.id;
      const { status, suspendReason } = req.body;

      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          status,
          suspendReason: suspendReason || ""
        }
      };

      const result = await userCollection.updateOne(query, updateDoc);

      
      res.send({
        modified: result.modifiedCount > 0,
        matched: result.matchedCount
      });
    });



    // products api with search + home filter
app.get("/products", async (req, res) => {
  try {
    const { search, limit, home } = req.query;

    let query = {};

   
    if (search && search.trim() !== "") {
      query.$or = [
        { product_name: { $regex: search, $options: "i" } },
        { product_category: { $regex: search, $options: "i" } },
      ];
    }

   
    if (home === "true") {
      query.show_on_home = "permit";
    }

    let cursor = AllproductsCollection.find(query);

    if (limit) {
      cursor = cursor.limit(parseInt(limit));
    }

    const result = await cursor.toArray();
    res.send(result);
  } catch (error) {
    res.status(500).send({ message: "Failed to load products" });
  }
});



    // update products information from admin
    app.put("/products/:id", async (req, res) => {
      const id = req.params.id;
      const body = req.body;

      const filter = { _id: new ObjectId(id) };

      const updatedDoc = {
        $set: {
          product_name: body.product_name,
          product_category: body.product_category,
          product_description: body.product_description,
          price_usd: body.price_usd,
          available_quantity: body.available_quantity,
          minimum_order: body.minimum_order,
          demo_video: body.demo_video,
          show_on_home: body.show_on_home || "no",
          payment_method: body.payment_method
        }
      };

      const result = await AllproductsCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });
    // show on home page permissin (admin)
    app.patch("/products/:id/show-on-home", async (req, res) => {
      const id = req.params.id;
      const { value } = req.body; 
      try {
        const filter = { _id: new ObjectId(id) };
        const updateDoc = { $set: { show_on_home: value } };
        const result = await AllproductsCollection.updateOne(filter, updateDoc);
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Failed to update show_on_home status" });
      }
    });


    // when manager created product post mongo db  
    app.post("/products", verifyToken, async (req, res) => {
      try {
        const product = {
          ...req.body,     // frontend already sends show_on_home
          createdAt: new Date(),
        };

        const result = await AllproductsCollection.insertOne(product);
        res.send(result);

      } catch (error) {
        res.status(500).send({ message: "Failed to add product" });
      }
    });


    // get manager created product data by email

    app.get("/products/by-manager/:email", async (req, res) => {
      try {
        const email = req.params.email;
        const result = await AllproductsCollection.find({ createdBy: email }).toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Failed to load manager products" });
      }
    });
    // products delete by manager 
    app.delete("/products/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };

      const result = await AllproductsCollection.deleteOne(query);
      res.send(result);
    });



    // details products

    app.get("/products/:id", async (req, res) => {
      const id = req.params.id;
      try {
        const product = await AllproductsCollection.findOne({ _id: new ObjectId(id) });
        if (!product) {
          return res.status(404).send({ message: "Product not found" });
        }
        res.send(product);
      } catch (error) {
        res.status(500).send({ message: "Invalid product ID" });
      }
    });



    //  trakings id realated api 

    app.get("/tracking/:trackingId", verifyToken, async (req, res) => {
      const trackingId = req.params.trackingId;

      const query = { trackingId };

      const result = await trakingCollection
        .find(query)
        .sort({ createdAt: -1 }) // latest first
        .toArray();

      res.send(result);
    });



    // buyer/user order bokking 
    app.post("/order", verifyToken, async (req, res) => {
      const order = req.body;
      order.createdAt = new Date();
      order.trackingId = generateTrackingId();
      order.orderStatus = "pending";
      order.paymentStatus = "unpaid";
      TrakingLog(order.trackingId, 'order-placed');
      const result = await orderCollection.insertOne(order);
      res.send(result);
    });

    // buyer bokking all order get with email
    app.get("/orders/by-buyer/:email", verifyToken, async (req, res) => {
      try {
        const email = req.params.email;
        const result = await orderCollection.find({ customerEmail: email }).toArray();
        res.send(result);
      } catch (err) {
        res.status(500).send({ message: "Failed to fetch buyer orders" });
      }
    });
    // if buyer want to cancel his order 
    app.delete("/orders/by-buyer/:id", verifyToken, async (req, res) => {
      try {
        const id = req.params.id;
        const order = await orderCollection.findOne({ _id: new ObjectId(id) });

        if (!order) {
          return res.status(404).send({ message: "Order not found" });
        }

        // If order already processed, cancel not allowed
        if (order.orderStatus !== "pending") {
          return res.status(400).send({ message: "Only pending orders can be cancelled" });
        }

        const result = await orderCollection.deleteOne({ _id: new ObjectId(id) });
        res.send(result);

      } catch (error) {
        res.status(500).send({ message: "Failed to delete order" });
      }
    });

    // Track order by trackingId (publicly accessible)
    app.get("/orders/track/:trackingId", async (req, res) => {
      try {
        const trackingId = req.params.trackingId;
        const order = await orderCollection.findOne({ trackingId });
        if (!order) return res.status(404).send({ message: "Order not found" });
        res.send(order);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Failed to fetch order" });
      }
    });




    //buyer bokking orders get with optional status filter (admin)

    app.get("/orders", async (req, res) => {
      const { email, status } = req.query;
      const query = {};

      if (email) query.customerEmail = email;

      if (status) {
        const statusArray = status.split(",");
        query.orderStatus = { $in: statusArray };
      }

      const orders = await orderCollection.find(query).sort({ createdAt: -1 }).toArray();
      res.send(orders);
    });





    // get  payment chekout parcel details

    app.get("/orders/:id", async (req, res) => {
      const id = req.params.id;
      const result = await orderCollection.findOne({ _id: new ObjectId(id) });
      res.send(result);
    });
    // get manager product order information
    // server.js
    // get manager product order information (excluding delivered)
    app.get("/orders/by-manager/:email", verifyToken, veryfyManager, async (req, res) => {
      try {
        const managerEmail = req.params.email;

        const orders = await orderCollection.find({
          manageremail: managerEmail,
          orderStatus: { $ne: "Delivered" }
        }).toArray();

        res.send(orders);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Failed to fetch orders" });
      }
    });


    // Get only completed/delivered orders for a manager
    app.get("/orders/completed/by-manager/:email", verifyToken, veryfyManager, async (req, res) => {
      try {
        const managerEmail = req.params.email;

        const orders = await orderCollection
          .find({
            managerEmail: managerEmail,
            "trackingLog.step": "Delivered"
          })
          .toArray();

        res.send(orders);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Failed to fetch completed orders" });
      }
    });
    // get only pending order
    app.get("/orders/pending/by-manager/:email", async (req, res) => {
      try {
        const managerEmail = req.params.email;

        const orders = await orderCollection
          .find({
            managerEmail: managerEmail,
            orderStatus: "pending",
            productName: { $exists: true, $ne: "" }
          })
          .toArray();

        res.send(orders);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Failed to fetch pending orders" });
      }
    });


    // order by buyer email

    // Accept/Reject order by manager

    app.patch("/orders/:id/status", verifyToken, async (req, res) => {
      try {
        const id = req.params.id;
        const { status } = req.body; // accepted / rejected
        const query = { _id: new ObjectId(id) };

        // 1 Update order status
        const updateDoc = { $set: { orderStatus: status } };
        const result = await orderCollection.updateOne(query, updateDoc);

        if (result.modifiedCount > 0) {
          // 2 Tracking log e step add kora
          const order = await orderCollection.findOne({ _id: new ObjectId(id) });
          if (order?.trackingId) {
            await TrakingLog(order.trackingId, `Order ${status}`);
          }

          res.send({ message: `Order ${status} successfully and tracking log updated` });
        } else {
          res.status(400).send({ message: "Failed to update order status" });
        }
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Server error" });
      }
    });

    // products order stastus chage  like (cutting,swining) manager
    app.patch("/orders/:id/tracking", verifyToken, veryfyManager, async (req, res) => {
      try {
        const id = req.params.id;
        const { step, note, location, datetime } = req.body;
        const order = await orderCollection.findOne({ _id: new ObjectId(id) });
        if (!order) return res.status(404).send({ message: "Order not found" });

        const alreadyExists = order.trackingLog?.some(t => t.step === step);
        if (alreadyExists) return res.status(400).send({ message: "Step already added" });

        const newTracking = {
          step,
          note: note || "",
          location: location || "",
          date: datetime ? new Date(datetime) : new Date(),
        };

        const updateDoc = { $push: { trackingLog: newTracking } };

        if (step === "Delivered") {
          updateDoc.$set = { orderStatus: "Delivered" };
        }

        await orderCollection.updateOne({ _id: new ObjectId(id) }, updateDoc);

        // Global tracking log
        if (order.trackingId) await TrakingLog(order.trackingId, step);

        const updatedOrder = await orderCollection.findOne({ _id: new ObjectId(id) });
        res.send(updatedOrder);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Failed to update tracking" });
      }
    });
    // Get approved orders  (manager)

    app.get("/orders/approved/by-manager/:email", verifyToken, async (req, res) => {
      try {
        const managerEmail = req.params.email;

        const orders = await orderCollection.find({
          managerEmail: managerEmail,
          orderStatus: "accepted"
        }).sort({ createdAt: -1 }).toArray();

        res.send(orders);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Failed to fetch approved orders" });
      }
    });



    // aggrigate papeline (advance topic)

    // get admin   dashboard all products status
    app.get("/orders/delivery-status/status", verifyToken, async (req, res) => {
      const papeline = [
        {
          $group: {
            _id: "$orderStatus",
            count: { $sum: 1 }
          }
        }
      ]
      const result = await orderCollection.aggregate(papeline).toArray();
      res.send(result)
    })





    //  payment chekout sesssion
    app.post('/create-checkout-session', async (req, res) => {


      const paymentInfo = req.body;
      // console.log(paymentInfo);

      const amount = parseInt(paymentInfo.totalPrice) * 100

      const session = await stripe.checkout.sessions.create({
        line_items: [
          {
            price_data: {
              unit_amount: amount,
              currency: "usd",
              product_data: {
                name: `please pay for ${paymentInfo.productName}`
              }
            },
            quantity: 1,
          },
        ],
        metadata: {
          productId: paymentInfo.productId,
          productName: paymentInfo.productName
        },
        customer_email: paymentInfo.buyerEmail, 
        mode: 'payment',
        success_url: `${process.env.SITE_URL}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.SITE_URL}/dashboard/payment-cancel?session_id={CHECKOUT_SESSION_ID}`,
      });

      res.send({ url: session.url });

    });


    // payment veryfy and created session id 
    app.post('/payment/verify', async (req, res) => {
      const { sessionId } = req.body;
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      const transactionId = session.payment_intent;

      const exists = await paymentHistory.findOne({ transactionId });
      if (exists) return res.send({ verified: true, message: "Payment already recorded", trackingId: exists.trackingId });

      if (session.payment_status === 'paid' || session.metadata?.productId) {
        const productId = session.metadata.productId;
        const currentOrder = await orderCollection.findOne({ _id: new ObjectId(productId) });
        const trackingId = currentOrder.trackingId;
        TrakingLog(trackingId, 'order_paid');

        await orderCollection.updateOne({ _id: new ObjectId(productId) }, {
          $set: {
            paymentStatus: 'paid',
            // orderStatus: 'order_paid',
            transactionId
          }
        });

        await paymentHistory.insertOne({
          amount: session.amount_total / 100,
          currency: session.currency,
          customerEmail: session.customer_details?.email,
          productId,
          productName: session.metadata.productName,
          trackingId,
          transactionId,
          paymentStatus: 'paid',
          paidAt: new Date()
        });

        return res.send({ verified: true, message: "Payment verified & saved", trackingId });
      }

      return res.send({ verified: false, message: "Payment not paid" });
    });


    // payment history api
    app.get("/payment", verifyToken, async (req, res) => {
      try {
        const email = req.query.email;
        const query = {};
        console.log(req.headers);



        if (email) {
          query.customerEmail = email;
          if (email !== req.decoded_email) {
            return res.status(403).send({ message: "forbided" })

          }
        }

        const cursor = paymentHistory.find(query).sort({ amount: -1, paidAt: -1 }).limit(8);
        const result = await cursor.toArray();

        res.send(result);
      } catch (error) {
        console.error("Payment fetch error:", error);
        res.status(500).send({ message: "Failed to fetch payment history" });
      }
    });



    app.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });
  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
  }
}

run().catch(console.dir);

