//Saranya R
//100981198

var express = require("express");
var app = express();
var hat = require("hat");
var bodyParser = require("body-parser");
var cookieParser = require("cookie-parser");
var mongo = require("mongodb").MongoClient;
const ROOT = "./public";
const database = "mongodb://localhost:27017/recipeDB";

//PurposE: Set template engine
app.set("views", "./views");
app.set("view engine", "pug");

//Purpose: Log incoming requests
app.use(function(req,res,next){
    next();
});

//purposE: START app
app.get("/", cookieParser(), function(req, res){
    var currentLogUser;
    if (req.cookies.username) {
        currentLogUser = req.cookies.username.toLowerCase();
    }
    mongo.connect(database,function(err, db){
        if (err) {
            res.sendStatus(500);
        } else {
            db.collection("users").findOne({username: currentLogUser}, function(err,user){
                if (user && user.auth === req.cookies.token) {
                    res.render("index",{user: {username:currentLogUser, auth:user.auth}});
                } else {
                    res.render("index",{});
                }

                db.close();
            });
        }
    });
});

//purpose: GET recipe list
app.get("/recipes", cookieParser(), function(req, res){
    var currentLogUser = req.cookies.username.toLowerCase();
    mongo.connect(database, function(err, db) {
        db.collection("users").findOne({username: currentLogUser}, function(err, user){
            if (err){
                res.sendStatus(500);
            } else {
                var recipeObj = {names: []};
                var cursor = db.collection(user.recipeCollection).find();
                cursor.each(function(err, document){
                    if (document !== null) {
                        recipeObj.names.push(document.name.split(" ").join("_"));
                    } else {
                        res.status(200).send(JSON.stringify(recipeObj));
                        db.close();
                    }
                });
            }
        });
    });
});

//purpose: for get/post request to view and submit
app.use("/recipe", bodyParser.urlencoded({extended:true}));
app.use("/recipe", cookieParser());


//PurposE: GET/VIEW recipes
app.get("/recipe/:rec", function(req, res){
    var currentLogUser = req.cookies.username.toLowerCase();
    var currentLogRecipe = req.params.rec.split("_").join(" ");
    mongo.connect(database, function(err, db) {
        db.collection("users").findOne({username: currentLogUser}, function(err, user){
            if (err) {
                res.sendStatus(500);
            } else {
                if(user && user.auth === req.cookies.token) {
                    db.collection(user.recipeCollection).findOne({name: currentLogRecipe}, function(err, recipe){
                        if (recipe) {
                            res.status(200).send(JSON.stringify(recipe));
                            db.close();
                        } else {
                            res.sendStatus(404);
                        }
                    });
                } else {
                    res.sendStatus(401);
                    db.close();
                }
            }
        });
    });
});


//Purpose: POST recipes
app.post("/recipe", function(req, res){
    var currentLogUser = req.cookies.username.toLowerCase();
    req.body.name = req.body.name.split("_").join(" ");
    if (req.body.name.length === 0) {
        res.sendStatus(400);
    } else {
        mongo.connect(database, function(err, db){
            db.collection("users").findOne({username: currentLogUser}, function(err, user){
                if (err) {
                    res.sendStatus(500);
                } else {
                    if (user && user.auth == req.cookies.token) {
                        postRecipe(db, user, req, res);
                    } else {
                        res.sendStatus(401);
                        db.close();
                    }
                }
            });
        });
    }
});

//Purpose: POST login
app.use(["/login","/register"], bodyParser.urlencoded({extended:false}));
app.post("/login", function(req,res){
    var currentLogUser = req.body.username.toLowerCase();
    mongo.connect(database, function(err,db){
        db.collection("users").findOne({username:currentLogUser},function(err,user){
            if(err){
                res.sendStatus(500);
                db.close();
            }else if(!user){ //not found
                res.render("login",{warning:"Username not found"});
                db.close();
            }else if(user.password !== req.body.password){ 
                res.render("login",{warning:"Incorrect password"});
                db.close();
            }else{ 
                var token = hat(); 
                user.auth=token; 

                db.collection("users").update({_id:user._id},user,function(err,result){
                    if(err){
                        res.sendStatus(500);
                    }else{
                        createAuthCookies(user,res);
                        res.redirect("/");
                    }
                    db.close();
                });
            }
        });
    });
});


//Purpose: POST register
app.post("/register", function(req, res){
    var currentLogUser = req.body.username.toLowerCase();
    mongo.connect(database, function(err,db){
        db.collection("users").findOne({username:currentLogUser},function(err,user){
            if(err){
                res.sendStatus(500);
                db.close();
            }else if(user){    
                res.render("register",{warning:"Username already exists"});
                db.close();
            }else{ //user not found
                user = new User(currentLogUser, req.body.password, res);
                var token = hat(); 
                user.auth=token; 
                db.collection("users").insert(user, function(err,result){
                    if(err){
                        res.sendStatus(500);
                    }else{
                        createAuthCookies(user,res);
                        res.redirect("/");
                    }
                    db.close();
                });
            }
        });
    });
});

app.get("/register", function(req, res) {
    res.render("register");
});

app.get("/login", function(req, res){
    res.render("login");
});

app.use(express.static(ROOT)); 

app.all("*", function(req, res) {
    res.sendStatus(404);
});

app.listen(2406, function(){
});

// Purpose: constructor for users
function User(name,pass,res){
    this.username = name;
    this.password = pass;
    this.recipeCollection = name + "recipes";
    mongo.connect(database, function(err, db) {
        db.createCollection(name + "recipes", function(err, collection){
            if(err){
                res.sendStatus(500);
            } else {
                db.close();
            }
        });
    });
}

// Purpose: create cookies
function createAuthCookies(user,res){
    //create auth cookie
    res.cookie("token", user.auth, {path:"/", maxAge:3600000});
    res.cookie("username", user.username, {path:"/", maxAge:3600000});
}

// PurposE: post helper function for POST recipe requests
function postRecipe(db, user, req, res) {
    db.collection(user.recipeCollection).findOne({name: req.body.name}, function(err, rec){
        if (err) {
            res.sendStatus(500);
        } else {
            if(rec){ 
                updateRecipe(db, user, rec, req, res);
            } else { 
                insertRecipe(db, user, req, res);
            }
        }
    });
}

// Purpose: insert helper for POST recipe requests
function insertRecipe(db, user, req, res){
    db.collection(user.recipeCollection).insert(req.body, function(err, result){
        if (err) {
            res.sendStatus(500);
            db.close();
        } else {
            res.sendStatus(200);
            db.close();
        }
    });
}

//Purpose: update helper for POST recipe requests
function updateRecipe(db, user, rec, req, res) {
    db.collection(user.recipeCollection).update({_id: rec._id}, req.body, function(err, result){
        if (err){
            res.sendStatus(500);
            db.close();
        } else {
            res.sendStatus(200);
            db.close();
        }
    });
}