// Version 4
// Version 3
(function () {
    // Creates a new canvas element and appends it as a child
    // to the parent element, and returns the reference to
    // the newly created canvas element


    function createCanvas(parent, width, height) {
        var canvas = {};
        canvas.node = document.createElement('canvas');
        canvas.node.style.border = "solid thin black"
        canvas.node.style.padding = 0;
        canvas.node.style.margin = "auto";
        canvas.node.style.display = "block";
        canvas.node.style.position = "absolute";
        canvas.node.style.top = 0;
        canvas.node.style.bottom = 0;
        canvas.node.style.left = 0;
        canvas.node.style.right = 0;
        canvas.node.style.width = "50%"
        canvas.context = canvas.node.getContext('2d');
        canvas.node.width = width || 100;
        canvas.node.height = height || 100;
        parent.appendChild(canvas.node);
        return canvas;
    }

    async function getFile(audioCtx, filepath) {
        const response = await fetch(filepath);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        return audioBuffer;
    }

    async function setupSample(audioCtx, filepath) {
        const sample = await getFile(audioCtx, filepath);
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

    function drawHand(ctx, radius, freq, elapsed) {
        ctx.save();
        ctx.globalCompositeOperation = 'color-dodge'
        ctx.strokeStyle = '#dba13daa';
        ctx.lineWidth = 9;
        ctx.translate(width / 2, height / 2)
        ctx.rotate(Math.PI * elapsed * freq);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        for (var i = 0; i < 10; i++) {
            ctx.lineTo(radius * (i + 1) / 11, Math.random() * 10);
        }
        ctx.stroke();
        ctx.restore();
    }

    function init(container, width, height) {
        var canvas = createCanvas(container, width, height);
        let RADIUS = width / 3;
        let startTime;

        // Audio parameters
        const TICK_PLAY_THRESH = 0.99;
        let tickBuffers;
        let lastTickAudioSource = null;
        let lastTickGain = null;
        let lastTickAudioIndex = 0;
        let lastTickPlayTime = 0;
        let currPitchBend = 0


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

        function draw(timestamp) {
            if (startTime === undefined)
                startTime = timestamp;

            const elapsed = (timestamp - startTime);
            var ctx = canvas.context;


            // Randomly tick
            var tickRand = Math.random()
            var tickSampleRand = parseInt(Math.random() * tickBuffers.length)
            if (tickRand > TICK_PLAY_THRESH) {
                var currTime = audioCtx.currentTime - lastTickPlayTime
                let newTickAudioSource = createAudioSource(audioCtx, tickBuffers[tickSampleRand])
                let newTickGain = audioCtx.createGain()
                newTickGain.gain.setValueAtTime(1, audioCtx.currentTime)
                newTickAudioSource.connect(newTickGain)
                newTickGain.connect(audioCtx.destination)
                newTickAudioSource.detune.value = currPitchBend
                currPitchBend = parseInt(2 * (Math.random() - 0.5) * 1200)

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
            }

            ctx.fillStyle = "#FFFFFF09"
            ctx.font = 12 + 'px serif'
            ctx.fillText("currPitchBend: " + currPitchBend, 10, 72) // TODO: remove

            // ctx.globalCompositeOperation = 'destination-over';
            ctx.fillStyle = "#00000012";
            ctx.fillRect(0, 0, width, height); // clear canvas


            // Calculate amplitude of the noise for this frame
            let noise_amp = 20.0 * (1 + Math.pow(Math.sin(elapsed * 1e-6 * Math.PI * 2), 2.0))
            ctx.fillStyle = "#FFFFFF09"
            ctx.font = 24 + 'px serif';
            // ctx.fillText("Noise amp: " + noise_amp.toExponential(9), 10, 24) // TODO: remove

            ctx.save();
            ctx.fillStyle = '#4557afff';
            ctx.strokeStyle = '#33003371';
            ctx.globalCompositeOperation = 'soft-light'
            ctx.lineCap = 'round';
            ctx.translate(width / 2, height / 2)
            ctx.beginPath();
            ctx.lineWidth = 1;

            const NUM_CIRCLES = 7;
            ctx.save()
            ctx.translate(node_noises[0], node_noises[1])
            for (var circleNum = 1; circleNum <= NUM_CIRCLES; circleNum += 1) {
                if (circleNum % 2 == 0) {
                    ctx.fillStyle = '#4557af63';
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
                    let arcRadius = radiusScale * (RADIUS + node_noises[i]);

                    if (i == 0)
                        ctx.moveTo(arcRadius, 0)
                    else
                        ctx.arcTo(lastPoint[0], lastPoint[1], Math.cos(toAngle) * arcRadius, Math.sin(toAngle) * arcRadius, 1 + Math.tanh(noise_amp))
                    lastPoint[0] = Math.cos(toAngle) * arcRadius
                    lastPoint[1] = Math.sin(toAngle) * arcRadius
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
                let blinkThresh = 0.995
                let numBlinkFrames = 10
                let shouldBlink = number_blink_states[i] > 0 && number_blink_states[i] < numBlinkFrames
                if ((blinkNoise > blinkThresh || shouldBlink) && (hour == 9 || hour == 3 || hour == 12 || hour == 6)) {
                    if (hour == 9)
                        hour = 'N̶̻̙̰̣̥̓̋͜͝͝I̸̢̨͈̰̬͈͐N̴̜͎̙̠͉͇̔̾̐̎Ę̶̈͋'
                    else if (hour == 3)
                        hour = "T̴̼͚̿H̷̺̅̎R̵̡̡̳͠E̴̺͈̗̯̍̓̉́ͅE̸̬̓̈̓̀"
                    else if (hour == 12)
                        hour = "T̴̡̙̾̈W̴̜̳̽Ḙ̸̀͗L̶̡̩̉̿V̷͉͒͝Ḙ̵͚̌"
                    else if (hour == 6)
                        hour = "S̷̟̥͐I̴̲̩̽͝X̶̭̠̑̄"
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
            drawHand(ctx, RADIUS * 1.5 + 5 * handNoise, 1e-3 / 10, elapsed);
            drawHand(ctx, RADIUS * 0.6 + handNoise, 1e-3, elapsed);

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
        setupSamples(audioCtx, TICK_FILENAMES)
            .then((buffers) => {
                tickBuffers = buffers
                console.log(tickBuffers) // TODO: Remove
                window.requestAnimationFrame(draw)
            })
        /* </Load assets> */
    }

    var container = document.getElementById('canvas');
    let width = Math.min(window.innerWidth, 800)
    let height = Math.min(window.innerHeight, 800)
    init(container, width, height);
})()
