import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
    id: {
         type: String, 
         required: true, 
         unique: true 
    },
    username: {
         type: String, 
         required: true, 
         unique: true 
    },
    password_hash: {
        type: String,
        required: true
    },
    name: {
        type: String,   
    },
    role: { 
        enum: ['admin', 'pathologist', 'technician'],
        type: String, 
        default: 'technician'
     },
},{ timestamps: true });

const userModel = mongoose.model('User', userSchema);

export default userModel;