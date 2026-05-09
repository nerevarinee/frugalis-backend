import * as z from "zod"; 

export const zodUser = 
    z.object({ 
        username: z.string(),
        email: z.email(),
        password: z.string()
    });

export const zodListing = 
    z.object({ 
        name: z.string(),
        price: z.string(),
        password: z.string()
    });