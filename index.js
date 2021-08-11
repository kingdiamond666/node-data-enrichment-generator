const express     = require('express');
const app         = express();
const getRawBody  = require('raw-body');
const crypto      = require('crypto');
const axios       = require('axios');
const { google }  = require('googleapis');
require('dotenv').config();
const {
  SHOPIFYWEBHOOKKEY,
  SHOPIFY_HMAC_METHOD,
  PERSON_API_KEY,
  HASHING_ALGO,
  SPREADSHEET_ID,
  PEOPLE_API
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

// Closing Procedures
process.on('SIGINT', function() {
  console.log( "\nGracefully shutting down from SIGINT (Ctrl-C)" );
  process.exit(1);
});

// GOOGLE SHEETS INTEGRATION
const auth = new google.auth.GoogleAuth({
  keyFile: 'keys.json',
  scopes: 'https://www.googleapis.com/auth/spreadsheets'
});

const authClientObject = async() => {
  const result = await auth.getClient();
  return result
}

const googleSheetsInstance = google.sheets({ version: "v4", auth: authClientObject })

const spreadsheetId = SPREADSHEET_ID;

async function putToGoogleSheets (object) {
    const arrayToInsertIntoSheet = Object.values(object)
    await googleSheetsInstance.spreadsheets.values.append({
      auth, //auth object
      spreadsheetId, //spreadsheet id
      range: "Sheet1!A:T", //sheet name and range of cells
      valueInputOption: "USER_ENTERED", // The information will be passed according to what the usere passes in as date, number or text
      resource: {
          values: [arrayToInsertIntoSheet],
      },
  });
}

// ========================= ROUTES =========================
// Take a post request at the webhook endprofileDetailsnt and display the data
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
    let order_results = axios.get(PEOPLE_API, {
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
      // DATA CLEANING/SANITIZATION FUNCTIONS

      //Take array and turn it into a string with email values separated by a comma
        function aggregate_personal_details_from_array (detailsArray) {
          let personal_details_collection_string = ''
          detailsArray.forEach(detail => {
            personal_details_collection_string += detail + ",";
          })
          return personal_details_collection_string
        }

        function parse_objects_from_array (detailsArray) {
          let personal_details_object_array = [];
          let personal_details_object_string = '';
          detailsArray.forEach( detailsObj => {
              let former_object_now_array = []
              Object.entries(detailsObj).forEach(([key,value]) => {
                former_object_now_array.push(`${key}: ${value}`)
              })
              personal_details_object_array.push(former_object_now_array)

            })
            personal_details_object_array.forEach(detail => {
                for(let i = 0; i < detail.length; i++){
                  // if (detail[i] === detail.length -1)
                personal_details_object_string += detail[i] === detail[detail.length - 1] ? detail[i] + " | " : detail[i] + " "
                }
            })
            return personal_details_object_string;
          }
      // Takes an item and optional function to run, throws it in a ternary and returns it
        function ternary_obj_assigner (detail_item, funcToRun) {
          if(detail_item && funcToRun ){
            return detail_item ? funcToRun(detail_item) : 'not provided'
          }
          else{
            return detail_item ? detail_item : 'not provided'
          }
        }

    let poi = checkProperties(profileDetails)
    let newPersonLocalData = {
      id: poi.id,
      order_email: ternary_obj_assigner(order.customer.email),
      full_name: ternary_obj_assigner(poi.full_name),
      first_name: ternary_obj_assigner(poi.first_name),
      last_name: ternary_obj_assigner(poi.last_name),
      linkedin_url: ternary_obj_assigner(poi.linkedin_url),
      facebook_id: ternary_obj_assigner(poi.facebook_id),
      facebook_username: ternary_obj_assigner(poi.facebook_username),
      twitter_url: ternary_obj_assigner(poi.twitter_url),
      work_email: ternary_obj_assigner(poi.work_email),
      personal_emails: ternary_obj_assigner(poi.personal_emails, aggregate_personal_details_from_array),
      skills: ternary_obj_assigner(poi.skills, aggregate_personal_details_from_array),
      job_title: ternary_obj_assigner(poi.job_title),
      job_company_id: ternary_obj_assigner(poi.job_company_name),
      emails: ternary_obj_assigner(poi.emails, parse_objects_from_array),
      profiles: ternary_obj_assigner(poi.profiles, parse_objects_from_array),
      location: ternary_obj_assigner(poi.location_name),
      city: ternary_obj_assigner(poi.location_locality),
      state: ternary_obj_assigner(poi.location_region),
      country: ternary_obj_assigner(poi.location_country)
    }
    putToGoogleSheets(newPersonLocalData)

    // console.log(profileDetails);
    // console.log('=========JOBS=============')
    // profileDetails.experience.forEach(job => console.log(job.company));
    // console.log('---------EDUCATION--------');
    // profileDetails.education.forEach(school => console.log(school))
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
