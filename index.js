
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
    await client.connect();
    console.log(" Connected to MongoDB");

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
      if (!user || user.role != "admin") {
        return res.status(403).send({ message: "forbiden access" });


      }
      next()
    }
    // rider secure data use valid token then access
    // const veryfyRider=async(req,res,next)=>{
    //   const email=req.decoded_email
    //   const query={email}
    //   const user=await userCollection.findOne(query)
    //   if (!user|| user.role!="rider") {
    //     return res.status(403).send({message:"forbiden access"});


    //   }
    //   next()
    // }
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
      const cursor = userCollection.find(query).sort({ createdAt: -1 }).limit(4)
      const result = await cursor.toArray()
      res.send(result)
    })
    //user suspend reason load api navber
    app.get("/users/:email", async (req, res) => {
      const email = req.params.email;
      const result = await userCollection.findOne({ email });
      res.send(result);
    });


    // get user base his role by this website 
    app.get("/user/:email/role", verifyToken, async (req, res) => {
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
    // patch /updated user role user to admin and admin to simple user

    //    
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

      // CUSTOM RESPONSE: React খুব easily বুঝবে
      res.send({
        modified: result.modifiedCount > 0,
        matched: result.matchedCount
      });
    });


    //     app.patch("/user/:id", verifyToken, veryfyAdmin, async (req, res) => {
    //   const id = req.params.id;
    //   const { status, suspendReason,role } = req.body;

    //   const query = { _id: new ObjectId(id) };
    //   const updateDoc = {
    //     $set: {
    //       status,
    //       suspendReason: suspendReason || ""  
    //     }
    //   };

    //   const result = await userCollection.updateOne(query, updateDoc);
    //   res.send(result);
    // });


    // app.patch("/user/:id", verifyToken, veryfyAdmin, async (req, res) => {
    //   const id = req.params.id;
    //   const statusInfo = req.body;

    //   const query = { _id: new ObjectId(id) };
    //   const updateDocs = {
    //     $set: {
    //       status: statusInfo.status
    //     }
    //   };

    //   const result = await userCollection.updateOne(query, updateDocs);
    //   res.send(result);
    // });

    // products related api
    app.get("/products", async (req, res) => {
      try {
        const limit = parseInt(req.query.limit);

        let cursor = AllproductsCollection.find({});

        if (limit) {
          cursor = cursor.limit(limit);
        }

        const result = await cursor.toArray();
        res.send(result);

      } catch (err) {
        console.error(err);
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
    // show on home page permissin admin
    app.patch("/products/:id/show-on-home", async (req, res) => {
      const id = req.params.id;
      const { value } = req.body; // "permit" or "no"
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
    app.post("/products", async (req, res) => {
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


    // app.post("/products", async (req, res) => {
    //   try {
    //     const product = req.body;
    //     const result = await AllproductsCollection.insertOne(product);
    //     res.send(result);
    //   } catch (error) {
    //     res.status(500).send({ message: "Failed to add product" });
    //   }
    // });
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
    // if manager want he can update his products information
    // app.put("/products/:id", async (req, res) => {
    //   const id = req.params.id;
    //   const body = req.body;

    //   const filter = { _id: new ObjectId(id) };

    //   const updatedDoc = {
    //     $set: {
    //       product_name: body.product_name,
    //       product_category: body.product_category,
    //       product_description: body.product_description,
    //       price_usd: body.price_usd,
    //       available_quantity: body.available_quantity,
    //       minimum_order: body.minimum_order,
    //       demo_video: body.demo_video,
    //     }
    //   };

    //   const result = await AllproductsCollection.updateOne(filter, updatedDoc);
    //   res.send(result);
    // });


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


    // rider collection relatead api (only admnin can see)

    // rider register/form filap zap shoft would like took part rider in zapshift

    // app.post("/rider", async (req, res) => {
    //   const rider = req.body
    //   rider.status = "pending";
    //   rider.createdAt = new Date()

    //   const userData = await riderCollection.insertOne(rider)
    //   res.send(userData)
    // })
    // // register people  get api those people
    // //  want feile like rider and the alredy registed and subn=mit rider frome
    // app.get("/rider", async (req, res) => {
    //   const { status, district, workStatus } = req.query
    //   const query = {};

    //   if (status) {
    //     query.status = status;
    //   }
    //   if (district) {
    //     query.District = district

    //   }
    //   if (workStatus) {
    //     query.workStatus = workStatus

    //   }

    //   const result = await riderCollection.find(query).toArray();
    //   res.send(result);
    // });
    // //  rider status updaated 
    // app.patch("/rider/:id", verifyToken, veryfyAdmin, async (req, res) => {
    //   try {
    //     const status = req.body.status
    //     const id = req.params.id;
    //     const query = { _id: new ObjectId(id) }

    //     const updateDocs = {
    //       $set: {
    //         status: status,
    //         workStatus: "available"
    //       }
    //     }
    //     const result = await riderCollection.updateOne(query, updateDocs)
    //     if (status === "approved") {
    //       const email = req.body.email
    //       const userQuary = { email }
    //       const updateUser = {
    //         $set: {
    //           role: "rider"
    //         }
    //       }
    //       const userResult = await userCollection.updateOne(userQuary, updateUser)

    //     }
    //     res.send(result);
    //   } catch (err) {
    //     console.error(err);
    //     res.status(500).send({ message: "Failed to update  rider" });
    //   }
    // });

    //  trakings id realated api 
    app.get("/tracking/:trackingId", async (req, res) => {
      const trackingId = req.params.trackingId;

      const query = { trackingId };

      const result = await trakingCollection
        .find(query)
        .sort({ createdAt: -1 }) // latest first
        .toArray();

      res.send(result);
    });



    // post pacel **note:jdi traking id realated kno problem hy tahole ai khane r payment api te hbe 
    // karon taking id genared double hye jete pare parcel created r parcel er payment hower por

    // new website 
    app.post("/order", async (req, res) => {
      const order = req.body;
      order.createdAt = new Date();
      order.trackingId = generateTrackingId();
      order.orderStatus = "pending";
      order.paymentStatus = "unpaid";
      TrakingLog(order.trackingId, 'order-placed');
      const result = await orderCollection.insertOne(order);
      res.send(result);
    });
    // // buyer home dashboard show products status
    // app.get("/order/:id", async (req, res) => {

    //   try {
    //     const id = req.params.id;
    //     const result = await orderCollection.findOne({
    //       _id: new ObjectId(id),
    //     });
    //     res.send(result);
    //   } catch (err) {
    //     console.error(err);
    //     res.status(500).send({ message: "Failed to delete issue" });
    //   }
    // })
    // order get 
    // orders get with optional status filter
    app.get("/orders", async (req, res) => {
      const { email, status } = req.query;
      const query = {};

      if (email) query.customerEmail = email;

      // multiple status support: pending, order_paid, accepted
      if (status) {
        const statusArray = status.split(",");
        query.orderStatus = { $in: statusArray };
      }

      const orders = await orderCollection.find(query).sort({ createdAt: -1 }).toArray();
      res.send(orders);
    });
    // // manager progile stasus show
    // app.get("/manager/stats/:email", async (req, res) => {
    //   const email = req.params.email;

    //   // Manager er sob order
    //   const orders = await orderCollection.find({
    //     managerEmail: email
    //   }).toArray();

    //   const totalOrders = orders.length;

    //   // Delivered = trackingLog er last step Delivered
    //   const delivered = orders.filter(order => {
    //     if (!order.trackingLog || order.trackingLog.length === 0) return false;
    //     return order.trackingLog.at(-1).step === "Delivered";
    //   }).length;

    //   // Pending = orderStatus pending
    //   const pending = orders.filter(
    //     order => order.orderStatus === "pending"
    //   ).length;

    //   res.send({
    //     totalOrders,
    //     delivered,
    //     pending
    //   });
    // });




    // get  payment chekout parcel details
    app.get("/orders/:id", async (req, res) => {
      const id = req.params.id;
      const result = await orderCollection.findOne({ _id: new ObjectId(id) });
      res.send(result);
    });
    // get manager product order information
    // server.js
    // get manager product order information (excluding delivered)
    app.get("/orders/by-manager/:email", async (req, res) => {
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

    // get all order admin can see all order 

    // app.get("/orders/admin", async (req, res) => {
    //   try {
    //     const orders = await orderCollection.find().toArray();
    //     res.send(orders);
    //   } catch (error) {
    //     console.error(error);
    //     res.status(500).send({ message: "Failed to fetch orders" });
    //   }
    // });
    // Get only completed/delivered orders for a manager
    app.get("/orders/completed/by-manager/:email", async (req, res) => {
      try {
        const managerEmail = req.params.email;

        const orders = await orderCollection
          .find({
            manageremail: managerEmail,
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
            manageremail: managerEmail, // manager এর email
            orderStatus: "pending",     // শুধুমাত্র pending orders
            // Optional: যদি শুধুমাত্র buyer এর product filter করতে চাই
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
    app.get("/orders/by-buyer/:email", async (req, res) => {
      try {
        const email = req.params.email;
        const result = await orderCollection.find({ customerEmail: email }).toArray();
        res.send(result);
      } catch (err) {
        res.status(500).send({ message: "Failed to fetch buyer orders" });
      }
    });
    // if buyer want to cancel his order 
    app.delete("/orders/by-buyer/:id", async (req, res) => {
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



    // Accept/Reject order by manager
    app.patch("/orders/:id/status", async (req, res) => {
      try {
        const id = req.params.id;
        const { status } = req.body; // accepted / rejected
        const query = { _id: new ObjectId(id) };

        // 1️⃣ Update order status
        const updateDoc = { $set: { orderStatus: status } };
        const result = await orderCollection.updateOne(query, updateDoc);

        if (result.modifiedCount > 0) {
          // 2️⃣ Tracking log e step add kora
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


    app.patch("/orders/:id/tracking", async (req, res) => {
      try {
        const id = req.params.id;
        const { step, note, location, datetime } = req.body; // extra fields optional

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

        // If Delivered, also update orderStatus
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
    // Get approved orders for manager
    app.get("/orders/approved/by-manager/:email", async (req, res) => {
      try {
        const managerEmail = req.params.email;

        const orders = await orderCollection.find({
          manageremail: managerEmail,
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
    app.get("/orders/delivery-status/status", async (req, res) => {
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




    // app.get("/parcels", async (req, res) => {
    //   try {
    //     const query = {};
    //     const { email, deliveryStatus, riderEmail } = req.query;

    //     if (email) query.EmailAddress = email; // sender email
    //     if (riderEmail) query.riderEmail = riderEmail; // rider only assigned
    //     if (deliveryStatus) {
    //       if (deliveryStatus !== "parcel_deliverd") {
    //         query.deliveryStatus = { $nin: ["parcel_deliverd"] };
    //       } else {
    //         query.deliveryStatus = deliveryStatus;
    //       }
    //     }

    //     const options = { sort: { createdAt: -1 } };
    //     const result = await ParcelsCollection.find(query, options).toArray();
    //     res.send(result);
    //   } catch (err) {
    //     console.error(err);
    //     res.status(500).send({ message: "Failed to fetch parcels" });
    //   }
    // });


    // // again patch parcel when the rider confirm the order (accepeted/reject) 
    // app.patch("/parcels/:id/status", async (req, res) => {
    //   const { deliveryStatus, riderId, trackingId } = req.body
    //   const id = req.params.id
    //   const query = { _id: new ObjectId(id) }
    //   const UpdatedDocs = {
    //     $set: {
    //       deliveryStatus: deliveryStatus
    //     }
    //   }
    //   if (deliveryStatus === 'parcel_deliverd') {
    //     // and update the same api hit rider status
    //     const riderQuery = { _id: new ObjectId(riderId) }
    //     const riderUpdatedDocs = {
    //       $set: {
    //         workStatus: "available"

    //       }
    //     }
    //     const riderResult = await riderCollection.updateOne(riderQuery, riderUpdatedDocs)
    //     res.send(riderResult)

    //   }
    //   const result = await ParcelsCollection.updateOne(query, UpdatedDocs)
    //   TrakingLog(trackingId, deliveryStatus)
    //   res.send(result)
    // })
    // // delete  parcel
    // app.delete("/parcels/:id", async (req, res) => {
    //   try {
    //     const id = req.params.id;
    //     const result = await ParcelsCollection.deleteOne({
    //       _id: new ObjectId(id),
    //     });
    //     res.send(result);
    //   } catch (err) {
    //     console.error(err);
    //     res.status(500).send({ message: "Failed to delete issue" });
    //   }
    // });

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
          orderId: paymentInfo.orderId,
          productName: paymentInfo.productName
        },
        customer_email: paymentInfo.buyerEmail, // <-- correct key
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

      if (session.payment_status === 'paid' || session.metadata?.orderId) {
        const orderId = session.metadata.orderId;
        const currentOrder = await orderCollection.findOne({ _id: new ObjectId(orderId) });
        const trackingId = currentOrder.trackingId;
        TrakingLog(trackingId, 'order_paid');

        await orderCollection.updateOne({ _id: new ObjectId(orderId) }, {
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
          orderId,
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

