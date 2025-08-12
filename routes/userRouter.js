const express=require('express')
const router=express.Router()
const usercontroller=require('../controllers/user/usercontroller')

router.get('/pageNotFound',usercontroller.pageNotFound)
router.get('/',usercontroller.loadHomepage)

module.exports=router