
const mongose=require('mongoose')
const env=require('dotenv').config()

const connectdb=async ()=>{
    try{
     await mongose.connect(process.env.MONGODB_URI)
     console.log('DB connected')
    }catch(error){
      console.log('DB connection error',error.message)
      process.exit(1)
    }
}
module.exports = connectdb