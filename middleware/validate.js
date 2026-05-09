import * as z from "zod";
import {zodUser, zodListing} from "../zod/schema.js";

export const validate = () => async (req, res, next) => {
  const {username, email, password} = req.body;
  try {
    const validation = await zodUser.parse({ username: username, email: email, password: password});
    if(validation){
      next();
    }
  } catch(error){
    console.log(error)
    return res.status(400).json(error)
    
    /*if(error instanceof z.ZodError){
      error.issues; 
    }*/
  }
};

export const loginValidate = () => async (req, res, next) => {
  const {email, password} = req.body;
  try {
    const validation = await zodUser.parse({ email: email, password: password});
    if(validation){
      next();
    }
  } catch(error){
    console.log(error)
    return res.status(400).json(error)
    
    /*if(error instanceof z.ZodError){
      error.issues; 
    }*/
  }
};