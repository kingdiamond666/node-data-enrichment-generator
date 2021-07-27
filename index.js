const express     = require('express');
const app         = express();
const getRawBody  = require('raw-body');
const crypto      = require('crypto');
const axios       = require('axios');
require('dotenv').config();
const {
  SHOPIFYWEBHOOKKEY,
  SHOPIFY_HMAC_METHOD,
  PERSON_API_KEY,
  HASHING_ALGO
} = process.env



function handleError (error) {
  if(error.response){
    console.log(`There was a response error: ${error.response.status}`)
  }else if(error.request){
    console.log(`There was a request error, check your URL and API Keys`)
  }else{
    console.log(`Error: ${ error.message}`)
  }
}
process.on('SIGINT', function() {
  console.log( "\nGracefully shutting down from SIGINT (Ctrl-C)" );
  // some other closing procedures go here
  process.exit(1);
});
// Take a post request at the webhook endpoint and display the data
app.post('/webhooks/orders/create', async (req, res) => {
  console.log('🎉 We got an order!')

  // Compare the hmac to our own hash
  const hmac = req.get(SHOPIFY_HMAC_METHOD)

  // Use raw-body to get the body (buffer)
  const body = await getRawBody(req)

  // Create a hash using the body and key
  const hash = crypto
    .createHmac(HASHING_ALGO, SHOPIFYWEBHOOKKEY)
    .update(body, 'utf8', 'hex')
    .digest('base64')

  // Compare our hash to Shopify's hash
  if (hash === hmac) {
    // It's a match! All good
    console.log('Phew, it came from Shopify!')
    res.sendStatus(200)
    // Parse out body from WebHook from Buffer into JSON String
    const order = JSON.parse(body.toString())
    // Store Customer Email in Variable
    let email = order.customer.email;
    let emailQuery = `email=${email}`
    // Shoot out axios request to people API
    // let order_results = axios.get(`https://api.peopledatalabs.com/v5/person/enrich?api_key=${PERSON_API_KEY}&${emailQuery}`)
    // TODO: Test this syntax otherwise switch back
    let order_results = axios.get(`https://api.peopledatalabs.com/v5/person/enrich`, {
      params:{
        api_key: PERSON_API_KEY,
        email: email
      }
    })
    .then (response => {
      profile = response.data;
      profileDetails = profile.data;
      // Checks if any keys are null or empty and deletes them
      function checkProperties(obj) {
          for (const key in obj) {
              if (obj[key] === null || obj[key] === ""){
              delete obj[key]
              }
          }
          return obj
      }

    checkProperties(profileDetails)
    console.log(profileDetails);
    console.log('=========JOBS=============')
    profileDetails.experience.forEach(job => console.log(job.company));
    console.log('---------EDUCATION--------');
    profileDetails.education.forEach(school => console.log(school))
  }).catch(handleError)
} else {
    // No match! This request didn't originate from Shopify
    console.log('Danger! Not from Shopify!')
    res.sendStatus(403)
  }
})

// app.post('/', (req, res) => {
//   console.log("We got an order")
//   res.sendStatus(200)
// })

app.listen(3000, () => console.log("Listening on port 3000"));
