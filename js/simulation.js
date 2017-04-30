
class Simulation {
    constructor(canvas,data) {
        this.canvas=canvas
        this.H = canvas.height = data.fuel.shape[0]
        this.W = canvas.width = data.fuel.shape[1]
        this.clock = 0;
        this.ignited=false

        data.fuel =  data.fuel.reshape([data.fuel.shape[0],data.fuel.shape[1],1])
        data.fire = nj.zeros(data.fuel.shape)
        data.ash = nj.zeros(data.fuel.shape)
        data.elev = data.elev.reshape([data.elev.shape[0],data.elev.shape[1],1])
        data.response = nj.zeros(data.fuel.shape)
        this.data = nj.concatenate([data.fire,data.fuel,data.ash,data.elev,data.response])

        this.responses = [] // locations of responses
        this.max_responses = 2
        this.fireman_strength = 0.2

        // var coords = this.ignite()
        this.display();
    }

    /* set an initial fire */
    ignite(e){
        this.ignited=true
        // TODO make click to ignore work with zooming
        var canvas = this.canvas

        // initial point away from walls
        // we will make a nice bright cross so it's visible
        var padding = _.round(this.W/4)
        var x,y
        if (e){
            x = -(e.latlng.lat-metadata.bounds[1][0])/(metadata.bounds[1][0]-metadata.bounds[0][0])*this.H
            y = (e.latlng.lng-metadata.bounds[0][1])/(metadata.bounds[1][1]-metadata.bounds[0][1])*this.W
            x=_.round(x)
            y=_.round(y)
        } else {
            x = _.round(d3.randomUniform(padding, this.W-padding)())
            y = _.round(d3.randomUniform(padding, this.H-padding)())
        }
        console.log('fire',x,y)
        this.data.set(x,y,0,1)


        // this.data.set(x+1,y,0,0.2*Math.random())
        // this.data.set(x-1,y,0,0.2*Math.random())
        // this.data.set(x,y+1,0,0.2*Math.random())
        // this.data.set(x,y-1,0,0.2*Math.random())
        //
        // this.data.set(x-1,y-1,0,0.1*Math.random())
        // this.data.set(x+1,y-1,0,0.1*Math.random())
        // this.data.set(x-1,y+1,0,0.1*Math.random())
        // this.data.set(x+1,y+1,0,0.1*Math.random())
        // this.data.set(x,y,1,0.3)
        this.display()
        return [x,y]
    }

    /* respond with a fire suppresson asset */
    respond(e){


        // get location of click
        var x = -(e.latlng.lat-metadata.bounds[1][0])/(metadata.bounds[1][0]-metadata.bounds[0][0])*this.H
        var y = (e.latlng.lng-metadata.bounds[0][1])/(metadata.bounds[1][1]-metadata.bounds[0][1])*this.W
        x=_.round(x)
        y=_.round(y)
        console.log('response',x,y)

        this.responses.push([x,y])
        this.responses=this.responses.slice(-this.max_responses) // keep the last few

        //clear data
        for (var x = 0; x < this.W; x++) {
            for (var y = 0; y < this.H; y++) {
                this.data.set(x,y,4,0)
            }
        }

        //reapply resposnes
        for (var i = 0; i < this.responses.length; i++) {
            x = this.responses[i][0]
            y = this.responses[i][1]
            this.data.set(x,y,4,this.fireman_strength)
        }
    }

    /* advance model by one tick */
    tick(){
        if (!this.ignited) this.ignite()
        // PARAMS TODO move them
        var fuelMultipler = 5 // how many turns it burns for
        var fireMultiplier = 1
        var fireGrowth = 1.5
        var transmissionChance = 0.3
        var response_distance = 3

        // distance to diagonal tiles as a ratio to tile size np.sqrt(1**2+1**2)
        var diagDist = 1.42

        // tick the environment
        this.clock++;
        var t0 = new Date().getTime()
        document.getElementById('slider').value=this.clock/10
        document.getElementById('slider-box').value=this.clock/10

        if (this.clock>100000) return 0;
        console.log('tick',this.clock)
        //
        // we are modifying the data in place, so freeze a copy of the old data
        var oldData = this.data.clone()

        /**
         * Equations: transmission_probability from a nearby tile:
         *  $ t = I * Rt$ where I is fire intensity and Rt is the slope term
         *  $ Rt = exp(0.069 theta) $ theta is the slope angle from -90 to 90 degrees
         *  this reflects that its hard for fire to spread downhill
         *  $ theta = atan(dh/w) $ where dh is the difference in height and w is width
         *  $ theta ~= dh/w $ using the small tan approximation
         *
         *  giving the total equation
         *  $ t = I * exp(0.069 *dh/w)  $
         *
         * (from Noble et al 1980, DOI: 10.1111/j.1442-9993.1980.tb01243.x)
         */
        var fires=0
        for (var x = 1; x < this.W-1; x++) {
            for (var y = 1; y < this.H-1; y++) {
                // can we do this as a convolution?
                var fire = oldData.get(x,y,0)*fireMultiplier
                var fuel = oldData.get(x,y,1)*fuelMultipler
                var ash = oldData.get(x,y,2)
                var nearby_response = oldData.slice([x-response_distance,x+response_distance+1],[y-response_distance,y+response_distance+1],[4,5]).sum()

                var transmissionProbability = 0
                if (fuel==0) continue

                ash += fire // fire from last turn causes ash to build up
                fuel = _.clamp(fuel-fire,0,fuelMultipler) // and fuel to decrease
                if (fire>0){
                    fire*=fireGrowth // exponentially grow within pixel
                } else {
                    // each neighbouring tile might light it

                    // intensity of fires in nearby cells
                    var fires_nearby = oldData.slice([x-1,x+2],[y-1,y+2],[0,1]).reshape(3,3)
                    // account for diagonal and zero the middle
                    if (fires_nearby.sum()==0) continue
                    var width_inv = nj.array([
                        [1/diagDist,1,      1/diagDist  ],
                        [1,         1e-7,   1           ],
                        [diagDist,  1,      1/diagDist  ]
                    ])
                    var intensity = nj.multiply(fires_nearby,width_inv)


                    // Slope spreading term                    //
                    // get difference in height ( height is in pixel width units)
                    var height = oldData.slice([x-1,x+2],[y-1,y+2],[3,4]).reshape(3,3)
                    var h0 = oldData.get(x,y,3)
                    var dHeight = nj.subtract(height,h0)
                    var Rt = nj.exp(nj.multiply(dHeight,width_inv).multiply(0.069))

                    transmissionProbability = nj.multiply(intensity,Rt)
                    transmissionProbability = transmissionProbability.mean()

                    // neighbouring tiles have a chance of lighting our tile
                    console.assert(transmissionProbability<=1)
                    if ((transmissionProbability*(fuel**2)*transmissionChance)<Math.random()) {
                        // nearby_fires=0
                        continue
                    }
                }
                // fire trucks put out the fire
                fire-=nearby_response
                // clamp between 0 and fuel remaining.
                fire =  _.clamp((fire+transmissionProbability),0,_.min([1,fuel/fuelMultipler]))
                // round it so we don't deal with tiny fractions
                fire = _.round(fire,2)

                console.assert(fire!=undefined)
                console.assert(fire!=null)
                console.assert(fuel!=undefined)

                this.data.set(x,y,0,fire/fireMultiplier)
                this.data.set(x,y,1,fuel/fuelMultipler)
                this.data.set(x,y,2,ash)
            }
        }

        var t = new Date().getTime()-t0
        console.log('tick',this.clock,'time',t)
        return t


    }

    /** push data onto canvases */
    display(){
        var H = this.W;
        var W = this.H;

        // first show fire

        // Fill in the fire layer
        var canvas = document.getElementById('fire')
        var ctx = canvas.getContext('2d');
        var imageData = ctx.getImageData(0,0,H,W)
        var color_scale = d3.interpolateLab('yellow','red')
        var fire = this.data.slice(null,null,[0,1])
        for (var x = 0; x < imageData.width; x++) {
            for (var y = 0; y < imageData.height; y++) {
                var d = fire.get(x,y,0)*2
                var c = new d3.color(color_scale(d))
                var i = (x*H+y)*4
                imageData.data[i+0]=c.r
                imageData.data[i+1]=c.g
                imageData.data[i+2]=c.b
                imageData.data[i+3]=_.clamp(d*255*2,0,255)
            }
        }
        ctx.putImageData(imageData, 0, 0);
        console.assert(this.data.selection.data.length/5*4==imageData.data.length)

        // Fill in the fuel layer
        var canvas = document.getElementById('fuel')
        var ctx = canvas.getContext('2d');
        var imageData = ctx.getImageData(0,0,H,W)
        var color_scale = d3.interpolateLab('white','green')
        var fuel = this.data.slice(null,null,[1,2])
        for (var x = 0; x < imageData.width; x++) {
            for (var y = 0; y < imageData.height; y++) {
                var d = fuel.get(x,y,0)
                var c = new d3.color(color_scale(d))
                var i = (x*H+y)*4
                imageData.data[i+0]=c.r
                imageData.data[i+1]=c.g
                imageData.data[i+2]=c.b
                imageData.data[i+3]=_.clamp(d*255*2,0,255)
            }
        }
        ctx.putImageData(imageData, 0, 0);
        console.assert(this.data.selection.data.length/5*4==imageData.data.length)


        // Fill in the ash layer
        var canvas = document.getElementById('ash')
        var ctx = canvas.getContext('2d');
        var imageData = ctx.getImageData(0,0,H,W)
        var color_scale = d3.interpolateLab('white','grey')
        var ash = this.data.slice(null,null,[2,3])
        for (var x = 0; x < imageData.width; x++) {
            for (var y = 0; y < imageData.height; y++) {
                var d = ash.get(x,y,0)
                var c = new d3.color(color_scale(d))
                var i = (x*H+y)*4
                imageData.data[i+0]=c.r
                imageData.data[i+1]=c.g
                imageData.data[i+2]=c.b
                imageData.data[i+3]=_.clamp(d*255*2,0,255)
            }
        }
        ctx.putImageData(imageData, 0, 0);
        console.assert(this.data.selection.data.length/5*4==imageData.data.length)

        // fill in response layer
        var canvas = document.getElementById('response')
        var ctx = canvas.getContext('2d');
        var imageData = ctx.getImageData(0,0,H,W)
        var color_scale = d3.interpolateLab('white','blue')
        var response = this.data.slice(null,null,[4,5])
        for (var x = 0; x < imageData.width; x++) {
            for (var y = 0; y < imageData.height; y++) {
                var d = response.get(x,y,0)*2/this.fireman_strength
                var c = new d3.color(color_scale(d))
                var i = (x*H+y)*4
                imageData.data[i+0]=c.r
                imageData.data[i+1]=c.g
                imageData.data[i+2]=c.b
                imageData.data[i+3]=_.clamp(d*255*2,0,255)
            }
        }
        ctx.putImageData(imageData, 0, 0);
        console.assert(this.data.selection.data.length/5*4==imageData.data.length)

    }
    /** this returns stats **/
    stats(){
        var fire = this.data.slice(null,null,[0,1])
        var burning_cells = 0
        for (var x = 1; x < this.W-1; x++) {
            for (var y = 1; y < this.H-1; y++) {
                if (fire.get(x,y,0)!=0) burning_cells++
            }
        }
        return {
            fire: _.round(fire.sum(),2),
            fuel: _.round(this.data.slice(null,null,[1,2]).sum(),2),
            ash: _.round(this.data.slice(null,null,[2,3]).sum(),2),
            burning_cells:burning_cells
        }
    }
    start(n=2000, callback){
        this.stop()
        this.loop = setInterval(()=>{
            this.tick()
            this.display()
            if (callback) callback()
        },n)
    }
    stop(){
        if (this.loop) clearInterval(this.loop)
    }
}
