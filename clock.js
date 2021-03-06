(function () {
    // Creates a new canvas element and appends it as a child
    // to the parent element, and returns the reference to
    // the newly created canvas element
    function createCanvas(parent) {
        var canvas = {};
        canvas.node = document.createElement('canvas');
        canvas.node.style.padding = 0;
        canvas.node.style.margin = "auto";
        canvas.node.style.display = "flex";
        canvas.node.style.position = "absolute";
        canvas.node.style.top = 0;
        canvas.node.style.bottom = 0;
        canvas.node.style.left = 0;
        canvas.node.style.right = 0;
        canvas.context = canvas.node.getContext('2d');
        canvas.node.width = Math.min(window.innerWidth, window.innerHeight);
        canvas.node.height = Math.min(window.innerWidth, window.innerHeight);

        try {
            canvas.glnode = fx.canvas()
        } catch (e) {
            console.error(e)
        }
        canvas.glnode.style.cssText = canvas.node.style.cssText;
        canvas.glcontext = canvas.glnode.getContext('webgl');
        canvas.glnode.width = canvas.node.width;
        canvas.glnode.height = canvas.node.height;

        canvas.mouse = { x: 0, y: 0 }
        canvas.node.addEventListener('mousemove', function onMouseMove(evt) {
            var rect = canvas.node.getBoundingClientRect();
            canvas.mouse.x = evt.x - rect.left
            canvas.mouse.y = evt.y - rect.top
        })
        window.onresize = function onResize() {
            canvas.node.width = Math.min(window.innerWidth, window.innerHeight);
            canvas.node.height = Math.min(window.innerWidth, window.innerHeight);
            canvas.glnode.width = canvas.node.width;
            canvas.glnode.height = canvas.node.height;
        }
        parent.appendChild(canvas.node);
        return canvas;
    }

    class RGBA {
        constructor(r, g, b, a) {
            this.r = r
            this.g = g
            this.b = b
            this.a = a
        }

        toString() {
            return `rgba(${this.r}, ${this.g}, ${this.b}, ${this.a})`
        }
    }

    async function createAudioBufferFromFile(audioCtx, filepath) {
        const response = await fetch(filepath);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        return audioBuffer;
    }

    async function setupSample(audioCtx, filepath) {
        const sample = await createAudioBufferFromFile(audioCtx, filepath);
        return sample;
    }

    async function setupSamples(audioCtx, filepaths) {
        let buffers = new Array(filepaths.length)
        for (var i = 0; i < buffers.length; i++) {
            buffers[i] = await setupSample(audioCtx, filepaths[i])
        }
        return buffers
    }

    function createAudioSource(audioCtx, audioBuffer) {
        const sampleSource = audioCtx.createBufferSource();
        sampleSource.buffer = audioBuffer;
        return sampleSource;
    }


    function createPanner(audioCtx) {
        panner = audioCtx.createPanner();
        listener = audioCtx.listener;

        panner.panningModel = 'HRTF';
        panner.distanceModel = 'inverse';
        panner.refDistance = 1;
        panner.maxDistance = 10000;
        panner.rolloffFactor = 1;
        panner.coneInnerAngle = 360;
        panner.coneOuterAngle = 0;
        panner.coneOuterGain = 0;

        if (panner.orientationX) {
            panner.orientationX.value = 1;
            panner.orientationY.value = 0;
            panner.orientationZ.value = 0;
        } else {
            panner.setOrientation(1, 0, 0);
        }

        if (listener.forwardX) {
            listener.forwardX.value = 0;
            listener.forwardY.value = 0;
            listener.forwardZ.value = -1;
            listener.upX.value = 0;
            listener.upY.value = 1;
            listener.upZ.value = 0;
        } else {
            listener.setOrientation(0, 0, -1, 0, 1, 0);
        }

        // listener will always be in the same place
        if (listener.positionX) {
            listener.positionX.value = 0;
            listener.positionY.value = 0;
            listener.positionZ.value = 0;
        } else {
            listener.setPosition(0, 0, 0);
        }

        return panner;
    }

    function positionPanner(panner, xPos, yPos, zPos) {
        const audioCtx = panner.context
        if (panner.positionX) {
            panner.positionX.setValueAtTime(xPos, audioCtx.currentTime);
            panner.positionY.setValueAtTime(yPos, audioCtx.currentTime);
            panner.positionZ.setValueAtTime(zPos, audioCtx.currentTime);
        } else {
            panner.setPosition(xPos, yPos, zPos);
        }
    }

    function drawHand(ctx, radius, freq, elapsed) {
        ctx.save();
        ctx.globalCompositeOperation = 'color-dodge'
        ctx.strokeStyle = '#dba13d5a';
        ctx.lineWidth = Math.random()*4+4;
        // ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.translate(ctx.canvas.width / 2, ctx.canvas.height / 2)
        ctx.rotate(Math.PI * elapsed * freq);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        var res = 100
        var noise = 0
        for (var i = 0; i < res; i++) {
            noise += 2 * Math.random() - 1;
            ctx.lineTo(radius * (i + 1) / (res + 1), noise);
        }
        ctx.stroke();
        ctx.restore();
    }

    function init(container) {
        var canvas = createCanvas(container);
        let startTime;
        let lastTimestamp = 0;
        let handsElapsedTime = 0;

        // Image parameters
        let images = [];
        let textures = []; // webgl textures for images
        let lastImage = null
        let lastImageTime = null
        let imagePlaybackRate = 1 // images per second
        let imageOpacity = 0.3

        // Audio parameters
        const TICK_PLAY_THRESH = 0.99;
        let tickBuffers = [];
        let lastTickAudioSource = null;
        let lastTickGain = null;
        let lastTickAudioIndex = 0;
        let lastTickPlayTime = 0;
        let currPitchBend = 0
        let currPanX = 0; let currPanXAngle = 0
        let currPanY = 0; let currPanYAngle = 0
        const INIT_PAN_Z = 4
        let currPanZ = INIT_PAN_Z


        function oscillate(input, min, max) {
            return (Math.sin(input) + 1) * 0.5 * (max - min) + min;
        }

        let noise_res = 50

        // Fill initial noise for each segment of the clock's circle
        let node_noises = new Array(noise_res);
        for (var i = 0; i < noise_res; i++) {
            node_noises[i] = (Math.random() - 0.5) * 2;
        }

        let number_blink_states = new Array(12).fill(0);
        let RADIUS = Math.min(canvas.node.width, canvas.node.height) / 2.5;
        let radius_walk = 0.0;
        let radius_walk_vel = 1.0;
        let radius_walk_vel_start = 0;
        let radius_walk_begin_vert = 0;
        let radius_walk_num_verts = 0

        function draw(timestamp) {
            if (startTime === undefined)
                startTime = timestamp;

            const elapsed = (timestamp - startTime);
            const timestampDiff = timestamp - lastTimestamp
            handsElapsedTime += timestampDiff
            lastTimestamp = timestamp
            var ctx = canvas.context;


            radius_walk_vel_start += 1;
            if (radius_walk_vel_start > 60) {
                radius_walk_vel_start = 0
                radius_walk_vel = 1.0;
            }
            radius_walk += radius_walk_vel * (Math.random() - 0.5) * 0.00001;

            //else
            //    RADIUS = Math.min(canvas.node.width, canvas.node.height) / 2.5
            // Random number that determines when next sound is played
            // ctx.fillStyle = "#FFFFFFF9"
            // ctx.font = 12 + 'px serif';
            // ctx.fillText("RADIUS: " + RADIUS, 10, 72) // TODO: remove
            var tickRand = Math.random()

            function drawAnimation() {
                lastImage = lastImage === null ? 0 : lastImage
                lastImageTime = lastImageTime === null ? timestamp : lastImageTime
                var img = images[lastImage]
                // Calculate divisor to scale image within aspect ratio
                var imgWidthDivisor = img.width / (canvas.node.width / 3)
                var imgHeightDivisor = img.height / (canvas.node.height / 3)
                var imgDivisor = Math.max(imgWidthDivisor, imgHeightDivisor)
                var imgWidth = img.width / imgDivisor
                var imgHeight = img.height / imgDivisor

                var noisyImagePlaybackRate = imagePlaybackRate * Math.random()
                if (timestamp - lastImageTime <= 1e3 / noisyImagePlaybackRate * Math.random()) {
                    // Draw webgl image onto hidden canvas
                    var texture = textures[lastImage]
                    canvas.glnode.draw(texture)
                        .hueSaturation(Math.random(), 0.5 + 0.5 * Math.random())
                        .brightnessContrast(Math.random(), Math.random())
                        .triangleBlur(100 * Math.random())
                        .update();
                    // Draw image to visible canvas
                    ctx.save()
                    ctx.globalAlpha = imageOpacity
                    ctx.drawImage(canvas.glnode, 0, canvas.node.height - imgHeight, imgWidth, imgHeight);
                    ctx.restore()
                }
                // Advance frame
                if (tickRand > TICK_PLAY_THRESH || timestamp - lastImageTime > 1e3 / noisyImagePlaybackRate) {
                    var nextImage = (lastImage + parseInt(Math.random() * images.length)) % images.length
                    imageOpacity = tickRand > TICK_PLAY_THRESH ? 0.8 : 0.3
                    lastImage = nextImage
                    lastImageTime = timestamp
                }
            }

            // drawAnimation();

            // Fuzz the position of the given panner
            function randomizePanner(panner) {
                if (panner !== null) {
                    var pannerNoiseX = Math.random() * 0.1
                    var pannerNoiseY = Math.random() * 0.1
                    currPanXAngle = (currPanXAngle + pannerNoiseX) % 1.0
                    currPanYAngle = (currPanYAngle + pannerNoiseY) % 1.0

                    const Xradius = 1
                    const Yradius = 1
                    currPanX = Math.cos(currPanXAngle * 2 * Math.PI) * Xradius
                    currPanY = Math.sin(currPanXAngle * 2 * Math.PI) * Yradius

                    var distFromListenerNorm = Math.sqrt(Math.pow(currPanX, 2) + Math.pow(currPanY, 2)) / Math.sqrt(Math.pow(Xradius, 2) + Math.pow(Yradius, 2))
                    currPanZ = INIT_PAN_Z - INIT_PAN_Z * distFromListenerNorm
                    positionPanner(panner, currPanX, currPanY, currPanZ)
                }
            }

            // Randomly tick
            var tickSampleRand = parseInt(Math.random() * tickBuffers.length)
            if (tickRand > TICK_PLAY_THRESH) {
                var currTime = audioCtx.currentTime - lastTickPlayTime
                let newTickAudioSource = createAudioSource(audioCtx, tickBuffers[tickSampleRand])
                let newTickGain = audioCtx.createGain()
                let newTickPanner = createPanner(audioCtx);
                handsElapsedTime += 2 * (Math.random() - 0.5) * (Math.random() * 1e3);

                newTickAudioSource.connect(newTickGain)
                newTickAudioSource.detune.value = currPitchBend
                currPitchBend = parseInt(4 * (Math.random() - 0.5) * 1200)

                newTickGain.connect(newTickPanner);
                newTickGain.gain.setValueAtTime(1, audioCtx.currentTime)

                randomizePanner(newTickPanner)
                newTickPanner.connect(audioCtx.destination)

                if (lastTickAudioSource !== null) {
                    lastTickGain.gain.exponentialRampToValueAtTime(0.03, audioCtx.currentTime + (lastTickAudioSource.buffer.duration - currTime))
                }

                if (lastTickAudioSource !== null && currTime < lastTickAudioSource.buffer.duration && lastTickAudioIndex == tickSampleRand) {
                    newTickAudioSource.start(0, currTime)
                } else {
                    newTickAudioSource.start()
                    lastTickPlayTime = audioCtx.currentTime
                }

                lastTickAudioIndex = tickSampleRand
                lastTickAudioSource = newTickAudioSource
                lastTickGain = newTickGain
                lastTickPanner = newTickPanner

                radius_walk_vel = Math.random()*2-1;
                radius_walk_vel_start = 0;
                radius_walk_begin_vert = Math.random() * noise_res;
                radius_walk_num_verts += Math.random();
            }

            // ctx.globalCompositeOperation = 'destination-over';
            ctx.fillStyle = new RGBA((1 + Math.sin(elapsed * 2 * Math.PI * 1e-3 * 0.1)) * 20 + 10, 0, (1 + Math.cos(elapsed * 2 * Math.PI * 1e-3 * 0.05)) * 5 + 10, (1 + Math.sin(Math.PI / 4 + elapsed * 2 * Math.PI * 1e-3 * 0.045)) * 0.235).toString()
            ctx.fillRect(0, 0, canvas.node.width, canvas.node.height); // clear canvas


            // Calculate amplitude of the noise for this frame
            let noise_amp = 20.0 * (1 + Math.pow(Math.sin(elapsed * 1e-6 * Math.PI * 2), 2.0))
            //ctx.fillStyle = "#FFFFFFF9"
            //ctx.font = 12 + 'px serif';
            //ctx.fillText("currPitchBend: " + currPitchBend, 10, 72) // TODO: remove
            //ctx.fillText("currPanX: " + currPanX.toFixed(2) + " | currPanY: " + currPanY.toFixed(2) + " | currPanZ: " + currPanZ.toFixed(2), 10, 72+28) // TODO: remove
            //ctx.fillText("noise_amp: " + noise_amp.toExponential(9), 10, 72+28*2) // TODO: remove

            ctx.save();
            ctx.fillStyle = '#4557afff';
            ctx.strokeStyle = '#33003371';
            ctx.globalCompositeOperation = 'soft-light'
            ctx.lineCap = 'round';
            ctx.translate(canvas.node.width / 2, canvas.node.height / 2)
            ctx.beginPath();
            ctx.lineWidth = 1;

            const NUM_CIRCLES = 12;
            ctx.save()
            ctx.translate(node_noises[0], node_noises[1])
            for (var circleNum = 1; circleNum <= NUM_CIRCLES; circleNum += 1) {
                if (circleNum % 2 == 0) {
                    ctx.fillStyle = '#95570f63';
                } else {
                    ctx.fillStyle = '#af4d2573';
                }
                let radiusScale = circleNum / NUM_CIRCLES + Math.random() * 0.1;
                let lastPoint = [0, 0];
                for (var i = 0; i < noise_res; i++) {
                    // Take a step in the random walk for this node
                    node_noises[i] = 0.9 * node_noises[i] + 0.2 * noise_amp * (2 * Math.random() - 1);

                    let fromAngle = 2 * Math.PI * i / noise_res
                    let toAngle = 2 * Math.PI * (i + 1) / noise_res
                    let oldRadius = RADIUS
                    // if (i > radius_walk_begin_vert && i < radius_walk_begin_vert + 5) {
                    //     if (radius_walk_vel > 1.0)
                    //         RADIUS = Math.pow(circleNum/NUM_CIRCLES,1.5) * Math.min(canvas.node.width, canvas.node.height) / 2.5 * 0.5 * (1 + 0.5 * Math.sin(elapsed * (radius_walk + 0.001)))
                    // }
                    let arcRadius = radiusScale * (RADIUS + node_noises[i]);

                    if (i == 0)
                        ctx.moveTo(arcRadius, 0)
                    else
                        ctx.arcTo(lastPoint[0], lastPoint[1], Math.cos(toAngle) * arcRadius, Math.sin(toAngle) * arcRadius, 1 + Math.tanh(noise_amp))
                    lastPoint[0] = Math.cos(toAngle) * arcRadius
                    lastPoint[1] = Math.sin(toAngle) * arcRadius
                    RADIUS = oldRadius;
                }
                ctx.arcTo(lastPoint[0], lastPoint[1], radiusScale * (RADIUS + node_noises[0]), 0, 1 + Math.tanh(noise_amp))
                ctx.stroke()
                ctx.fill()
            }
            ctx.restore()

            for (var i = 0; i < 12; i++) {
                let textNoise = node_noises[parseInt(noise_res / 12) * i] * 0.5 * (1 + Math.sin(i)) * 0.25
                ctx.save();
                let fontPx = 48;
                ctx.globalCompositeOperation = 'screen'
                ctx.fillStyle = "#AAEE2271"
                ctx.strokeStyle = "#f4ce2533"
                ctx.lineWidth = 2 + 3 * (1 + Math.sin(elapsed * 1e-4 + (i * 3 % 12)))
                ctx.font = fontPx + 'px serif';
                ctx.textAlign = 'center';
                let hour = (i + 2) % 12 + 1


                let blinkNoise = Math.random()
                let blinkThresh = 0.9995
                let numBlinkFrames = Math.random()*15
                let shouldBlink = number_blink_states[i] > 0 && number_blink_states[i] < numBlinkFrames
                if ((blinkNoise > blinkThresh || shouldBlink) && (hour == 9 || hour == 3 || hour == 12 || hour == 6)) {
                    if (hour == 9)
                        hour = 'N??????????????????????I????????????????N??????????????????????E????????'
                    else if (hour == 3)
                        hour = "T????????H????????R??????????E????????????????????E????????????"
                    else if (hour == 12)
                        hour = "T??????????W????????E????????L??????????V????????E????????"
                    else if (hour == 6)
                        hour = "S????????I??????????X??????????"
                    textNoise *= 1.74;
                    ctx.globalCompositeOperation = 'exclude'
                    ctx.font = fontPx * 1.125 + 'px serif';
                    ctx.fillStyle = "#00000000"
                    ctx.strokeStyle = "#FF3F3FFF"
                    ctx.lineWidth = 0.75

                    number_blink_states[i] = (number_blink_states[i] + 1) % numBlinkFrames
                }

                let arcRadius = RADIUS + textNoise;
                let fromAngle = 2 * Math.PI * i / 12;
                let toAngle = 2 * Math.PI * (i + 1) / 12;
                ctx.fillText(hour + '',
                    (arcRadius + 15 + textNoise * fontPx / 18) * Math.cos(fromAngle),
                    (arcRadius + 15 + textNoise * fontPx / 18) * Math.sin(fromAngle));
                ctx.strokeText(hour + '',
                    (arcRadius + 10 + textNoise * fontPx / 18) * Math.cos(fromAngle),
                    (arcRadius + 10 + textNoise * fontPx / 18) * Math.sin(fromAngle));
                ctx.restore();
            }
            ctx.stroke();
            ctx.restore();

            let handNoise = Math.random() * 2 - 1;
            drawHand(ctx, RADIUS * 1.5 + 5 * handNoise, 1e-3 / 10, 0.2 * elapsed + 0.8 * handsElapsedTime);
            drawHand(ctx, RADIUS * 0.6 + handNoise, 1e-3, 0.8 * elapsed + 0.2 * handsElapsedTime);

            window.requestAnimationFrame(draw);
        }

        /* <Load assets> */
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        const audioCtx = new AudioContext();
        const TICK_FILENAMES = [
            'audio/Ti To-001.wav',
            'audio/Ti To-002.wav',
            'audio/Ti To-003.wav',
            'audio/Ti To-004.wav',
            'audio/Ti To-005.wav',
            'audio/Ti To-006.wav',
            'audio/Ti To-007.wav',
            'audio/Ti To-008.wav',
            'audio/Tickle Tockle (low 1 comp).wav',
            'audio/01-210709_2012-glued.wav',
            'audio/Tickle Tockle (arcade comp).wav'
        ]

        // Setup images
        var imageLoadPromises = []
        for (var i = 3; i < 19; i++) {
            imageLoadPromises.push(new Promise((resolve, reject) => {
                var image = new Image()
                image.src = "images/frame_" + i + ".png"
                image.onload = function (evt) {
                    images.push(image)
                    textures.push(canvas.glnode.texture(image))
                    resolve()
                }
            }))
        }

        function onInitButtonClick(evt) {
            var tmpSrc = createAudioSource(audioCtx, tickBuffers[0])
            var tmpGain = audioCtx.createGain()
            tmpGain.gain.setValueAtTime(0, audioCtx.currentTime)
            tmpSrc.connect(tmpGain)
            tmpGain.connect(audioCtx.destination)
            tmpSrc.start()

            var initButton = document.getElementById('initButton')
            initButton.parentNode.removeChild(initButton)
            window.requestAnimationFrame(draw)
        }

        Promise.all(imageLoadPromises)
            .then(() => { return setupSamples(audioCtx, TICK_FILENAMES) })
            .then((buffers) => {
                tickBuffers = buffers
                var initButton = document.getElementById('initButton')
                initButton.classList.remove("begin-button-disabled")
                initButton.classList.add("begin-button-enabled")
                initButton.removeAttribute("disabled")
                initButton.textContent = "B??????????E??????????G??????????????I????????N??????"
                var initButtonDiv = document.getElementById('initButtonDiv')
                initButtonDiv.addEventListener("click", onInitButtonClick)
                initButtonDiv.addEventListener("touchend", onInitButtonClick)
            })
        /* </Load assets> */
    }
    var container = document.getElementById('canvas')
    init(container)
})()
