mapboxgl.accessToken = "pk.eyJ1Ijoic3ViaGFtcHJlZXQiLCJhIjoiY2toY2IwejF1MDdodzJxbWRuZHAweDV6aiJ9.Ys8MP5kVTk5P9V2TDvnuDg";

let waypoints = [];
let allLocations = [];
let map; // To hold the map object
let moveMarker; // To hold the moving marker
let currentWaypointIndex = 0; // To track the current waypoint index
let qaoa_costtime = [];
let dijk_costTime = [];
function initializeMap(position) {
    const userLocation = [position.coords.longitude, position.coords.latitude];

    waypoints.push(userLocation);  // Add the user's location as the first waypoint

    // Initialize the map
    map = new mapboxgl.Map({
        container: 'map',
        style: 'mapbox://styles/mapbox/traffic-night-v2',
        center: userLocation, // Starting point: user's current location
        zoom: 9,
        hash: true
    });

    map.addControl(new mapboxgl.NavigationControl());
    map.addControl(new MapboxTraffic());

    new mapboxgl.Marker({ color: "red" })
        .setLngLat(userLocation)
        .setPopup(new mapboxgl.Popup().setText("You are here"))
        .addTo(map);


    let geocoderCount = 1;

    function addGeocoder() {
        const geocoderContainer = document.createElement('div');
        geocoderContainer.id = `geocoder${geocoderCount}`;
        document.getElementById('geocoders').appendChild(geocoderContainer);

        const geocoder = new MapboxGeocoder({
            accessToken: mapboxgl.accessToken,
            mapboxgl: mapboxgl,
            placeholder: `Search point ${geocoderCount}`
        });

        document.getElementById(`geocoder${geocoderCount}`).appendChild(geocoder.onAdd(map));

        geocoderCount++;

        geocoder.on('result', (e) => {
            const coords = e.result.geometry.coordinates;
            const name = e.result.place_name || "Unnamed location"; // Use place_name or fallback to a generic name

            new mapboxgl.Marker()
                .setLngLat(coords)
                .setPopup(new mapboxgl.Popup().setText(name)) // Add popup with name
                .addTo(map);

            waypoints.push(coords);
            allLocations.push(coords);
            updateRoute();
        });
    }

    addGeocoder();

    document.getElementById('circle-btn').addEventListener('click', () => {
        addGeocoder();
    });

    function calculateDistance(coord1, coord2) {
        const R = 6371; // Radius of the Earth in km
        const lat1 = coord1[1];
        const lon1 = coord1[0];
        const lat2 = coord2[1];
        const lon2 = coord2[0];

        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;

        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);

        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return R * c;
    }
    //adding a new code
    function createDistanceMatrix() {
        const numLocations = waypoints.length;
        const distanceMatrix = Array.from({ length: numLocations }, () => Array(numLocations).fill(0));

        for (let i = 0; i < numLocations; i++) {
            for (let j = 0; j < numLocations; j++) {
                if (i !== j) {
                    distanceMatrix[i][j] = calculateDistance(waypoints[i], waypoints[j]).toFixed(2); // Distance in km
                }
            }
        }

        console.table(distanceMatrix); // Display in console
    }

    //ending
    function optimizeRoute() {

        if (waypoints.length < 2) return;
        let currentLocation = waypoints[0];
        let optimizedWaypoints = [currentLocation];
        qaoa_costtime.length = 0;
        dijk_costTime.length = 0;

        let remainingLocations = [...allLocations];
        remainingLocations = remainingLocations.filter(location => location !== currentLocation);

       
        while (remainingLocations.length > 0) {
            startTime = performance.now();
            let closestLocation = null;
            let closestDistance = Infinity;

            remainingLocations.forEach(location => {
                const distance = calculateDistance(currentLocation, location);
                if (distance < closestDistance) {
                    closestDistance = distance;
                    closestLocation = location;
                }
            });

            optimizedWaypoints.push(closestLocation);
            currentLocation = closestLocation;
            remainingLocations = remainingLocations.filter(location => location !== closestLocation);

        }
        (async function () {
            
            waypoints = await quantumoptimizeRoute();
            
            let data_qaoa = waypoints;
            qaoa_costtime = await Calculate_Cost_Time(); //  Await is valid here
            

            waypoints = optimizedWaypoints;
            
        
            dijk_costTime = await Calculate_Cost_Time(); //  Await is valid here
        
            
            if (!qaoa_costtime || !dijk_costTime || qaoa_costtime.length === 0 || dijk_costTime.length === 0) {
                console.error("Error: Cost time arrays are empty or undefined.");
                return;
            }
        
            let qaoa_last_cost = parseFloat(qaoa_costtime[qaoa_costtime.length - 1]?.cost || "0");
            let dijk_last_cost = parseFloat(dijk_costTime[dijk_costTime.length - 1]?.cost || "0");
        
            if (qaoa_last_cost < dijk_last_cost) {
                waypoints = data_qaoa;
            }
        
            updateRoute();
            createDistanceMatrix();
        })();
        
        
        // console.log(costTime)
    }
    
    async function quantumoptimizeRoute() {
        try {
            console.log("Parsed waypoints:", waypoints); // Debugging
    
            if (!waypoints.length || waypoints.some(coord => isNaN(coord[0]) || isNaN(coord[1]))) {
                alert("Invalid input format! Use 'longitude,latitude;longitude,latitude'.");
                return;
            }
    
            // Send request to Flask backend
            const response = await fetch("http://127.0.0.1:5000/optimize", {  // Ensure correct backend URL
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ waypoints: waypoints })
            });
    
            console.log("Server response:", response); // Debugging
    
            const data = await response.json();
            // Assign new values
            // updateRoute();
            // Calculate_Cost_Time();
    
            if (response.ok) {
                console.log("Optimized Route:", data.optimized_route);
                alert("Optimized Route: " + JSON.stringify(data.optimized_route));
            } else {
                console.error("Backend Error:", data.error);
                alert("Backend Error: " + data.error);
            }
            return data.optimized_route
        } catch (error) {
            console.error("Request failed:", error);
            alert("An unexpected error occurred. Check console logs.");
        }
    }
    
    
    
    
    async function Calculate_Cost_Time() {
        const route = await updateRoute(true); // Ensure route data is fetched
        let costTime = [];
        if (!route || !route.legs) {
            console.error("Error: Route is undefined or missing legs");
            return;
        }

        let cost = [0];
        let totalTime = 0;
        const costPerLiter = 104; // ₹ per liter
        const mileage = 50; // 50 km per liter
        costTime.push({ cost: 0, time: 0 });
        route.legs.forEach((leg, index) => {
            let distance = leg.distance / 1000; // Convert meters to km
            let travelTime = leg.duration / 3600; // Convert seconds to hours

            totalTime += travelTime;
            cost.push((parseFloat(cost.at(-1)) + (distance / mileage).toFixed(2) * costPerLiter).toFixed(2));

            costTime.push({ cost: cost[index + 1], time: totalTime.toFixed(2) });
        });
        return costTime;
    }


    function updateRoute(traffic = false) {
        if (waypoints.length < 2) {
            return Promise.resolve(null); // Ensure a promise is always returned
        }

        const coordinates = waypoints.map(point => point.join(',')).join(';');
        const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coordinates}?geometries=geojson&steps=true&overview=full&access_token=${mapboxgl.accessToken}`;

        return fetch(url)
            .then(response => response.json())
            .then(data => {
                const route = data.routes[0];
                const routeTime = Math.round(route.duration / 60); //for bike
                const distanceKm = (route.distance / 1000).toFixed(2);
                let Totaldistance = `Distance: ${distanceKm} KM`;
                const liter = (distanceKm / 50).toFixed(2);
                let TotalCost = `Total Cost: ${liter * 104} ₹`;
                let displayTime;
                if (routeTime >= 60) {
                    const hours = Math.floor(routeTime / 60);
                    const minutes = routeTime % 60;
                    displayTime = `Driving: ${hours} hour${hours > 1 ? 's' : ''} ${minutes} minute${minutes !== 1 ? 's' : ''}`;
                } else {
                    displayTime = `Driving: ${routeTime} minute${routeTime !== 1 ? 's' : ''}`;
                }

                document.getElementById('time-driving').innerText = displayTime;
                document.getElementById('distance').innerText = Totaldistance;
                document.getElementById('Total-Cost').innerText = TotalCost;

                if (traffic) {
                    return route; // Return the route object if traffic is true
                }

                const instructionsList = document.getElementById('steps');
                instructionsList.innerHTML = '';

                route.legs.forEach((leg, legIndex) => {
                    leg.steps.forEach((step, stepIndex) => {
                        const li = document.createElement('li');
                        li.innerText = `Leg ${legIndex + 1}, Step ${stepIndex + 1}: ${step.maneuver.instruction}`;
                        instructionsList.appendChild(li);
                    });
                });

                const geojson = {
                    type: 'Feature',
                    geometry: route.geometry
                };

                if (map.getSource('route')) {
                    map.getSource('route').setData(geojson);
                } else {
                    map.addSource('route', {
                        type: 'geojson',
                        data: geojson
                    });

                    map.addLayer({
                        id: 'route',
                        type: 'line',
                        source: 'route',
                        paint: {
                            'line-color': 'rgba(255, 255, 255, 0.5)',
                            'line-width': 5,
                            'line-opacity': 1
                        }
                    });
                }

                const bounds = new mapboxgl.LngLatBounds();
                route.geometry.coordinates.forEach(coord => bounds.extend(coord));
                map.fitBounds(bounds, { padding: 20 });

                waypoints.forEach((point, index) => {
                    const markerElement = document.createElement('div');
                    markerElement.className = 'marker-number';
                    markerElement.innerText = index + 1;

                    const popup = new mapboxgl.Popup().setText(`Waypoint ${index + 1}`);

                    new mapboxgl.Marker(markerElement)
                        .setLngLat(point)
                        .setPopup(popup)
                        .addTo(map);
                });

                moveMarker = new mapboxgl.Marker({ color: "green" })
                    .setLngLat(waypoints[0])
                    .addTo(map);

                return route; // Ensure the promise resolves with the route
            });
    }



    // Event listeners for buttons
    document.getElementById('optimize-btn').addEventListener('click', () => {
        console.log("Optimize button clicked!");
        optimizeRoute();
    });

    // Move the marker along the route
    document.getElementById('move-btn').addEventListener('click', () => {
        moveToWaypoints();
    });

    $(document).ready(function () {
        $("#toggleButton").click(function () {
            $(".extra-buttons").toggle(); // Toggles the visibility of extra buttons
        });

        // Trigger file input when Button 2 is clicked
        $("#button2").click(function () {
            $("#fileInput").click(); // Simulate a click on the file input
        });
    });
    let costChart = null;

    function showCostGraph() {
        let ctx = document.getElementById('costTimeChart').getContext('2d');
        let noDataMessage = document.getElementById('noDataMessage');
        let chartCanvas = document.getElementById('costTimeChart');
    
        if (dijk_costTime.length === 0 && qaoa_costtime.length === 0) {
            noDataMessage.style.display = "block";
            chartCanvas.style.display = "none";
            return;
        } else {
            noDataMessage.style.display = "none";
            chartCanvas.style.display = "block";
        }
    
        if (costChart) {
            costChart.destroy(); // Destroy the old chart
        }
    
        costChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: dijk_costTime.map(data => data.cost), // Assuming both datasets have similar cost labels
                datasets: [
                    {
                        label: "Dijkstra's",
                        data: dijk_costTime.map(data => data.time),
                        borderColor: 'rgba(75, 192, 192, 1)',
                        backgroundColor: 'rgba(75, 192, 192, 0.2)',
                        borderWidth: 2
                    },
                    {
                        label: "QAOA",
                        data: qaoa_costtime.map(data => data.time),
                        borderColor: 'rgba(255, 99, 132, 1)',
                        backgroundColor: 'rgba(255, 99, 132, 0.2)',
                        borderWidth: 2
                    }
                ]
            },
            options: {
                responsive: true,
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: function (tooltipItem) {
                                let index = tooltipItem.dataIndex;
                                let cost = dijk_costTime[index]?.cost || qaoa_costtime[index]?.cost;
                                let timeDijk = dijk_costTime[index]?.time ?? "N/A";
                                let timeQaoa = qaoa_costtime[index]?.time ?? "N/A";
                                return [
                                    `Cost: ₹${cost}`,
                                    `Dijkstra's Time: ${timeDijk} hrs`,
                                    `QAOA Time: ${timeQaoa} hrs`
                                ];
                            }
                        }
                    },
                    datalabels: {
                        align: 'top',
                        color: '#6a6567',
                        font: { weight: 'bold' },
                        formatter: function (value, context) {
                            return context.dataIndex === 0 ? '' : `${context.dataIndex}`;
                        }
                    }
                },
                scales: {
                    x: { title: { display: true, text: 'Cost (₹)' } },
                    y: { title: { display: true, text: 'Time (hours)' }, beginAtZero: true }
                }
            },
            plugins: [ChartDataLabels] // Enable data labels plugin
        });
    }
    
    
    
    
    
    
    

    $('#exampleModalCenter').on('shown.bs.modal', showCostGraph);


    fileInput.addEventListener('change', function () {
        const file = this.files[0];
        if (file && file.type === "text/plain") {
            const reader = new FileReader();

            reader.onload = function () {
                const content = reader.result;
                const locations = content.split('.').map(loc => loc.trim()).filter(loc => loc);

                // Check if the 'route' layer exists before trying to remove it
                if (map.getLayer('route')) {
                    map.removeLayer('route');
                }


                // Clear previous waypoints
                waypoints = [];
                allLocations = [];

                // Get the user's current GPS location
                navigator.geolocation.getCurrentPosition(function (position) {
                    const userLocation = [position.coords.longitude, position.coords.latitude];

                    // Add user's GPS location as the first waypoint
                    waypoints.push(userLocation);
                    allLocations.push(userLocation);

                    // Add marker for user's location
                    new mapboxgl.Marker({ color: "red" })
                        .setLngLat(userLocation)
                        .setPopup(new mapboxgl.Popup().setText("Your Location"))
                        .addTo(map);

                    // Now geocode the locations from the .txt file
                    const geocodePromises = locations.map(location => geocodeLocation(location));

                    Promise.all(geocodePromises).then(coordinates => {
                        coordinates.forEach(coord => {
                            if (coord) {
                                waypoints.push(coord);
                                allLocations.push(coord);

                                new mapboxgl.Marker()
                                    .setLngLat(coord)
                                    .setPopup(new mapboxgl.Popup().setText("Location"))
                                    .addTo(map);
                            }
                        });

                        // Update the route on the map
                        updateRoute();
                    });
                }, function (error) {
                    console.error('Error getting GPS location:', error);
                });
            };

            reader.readAsText(file);
        } else {
            alert('Only .txt files are accepted.');
            fileInput.value = ''; // Clear the input
        }
    });
    function geocodeLocation(location) {
        return fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(location)}.json?access_token=${mapboxgl.accessToken}`)
            .then(response => response.json())
            .then(data => {
                if (data.features.length > 0) {
                    return data.features[0].geometry.coordinates;
                } else {
                    alert(`Location "${location}" could not be geocoded.`);
                    return null;
                }
            })
            .catch(error => {
                console.error('Error geocoding location:', error);
                return null;
            });
    }
}

function moveToWaypoints() {
    if (waypoints.length < 2 || !map.getSource('route')) return; // Ensure we have a route and at least two waypoints

    currentWaypointIndex = 0; // Reset to the first waypoint
    moveMarker.setLngLat(waypoints[currentWaypointIndex]); // Start at the first waypoint

    const routeCoordinates = map.getSource('route')._data.geometry.coordinates;

    function animate() {
        if (currentWaypointIndex < routeCoordinates.length - 1) {
            const start = routeCoordinates[currentWaypointIndex];
            const end = routeCoordinates[currentWaypointIndex + 1];

            // Animate the marker along the route between start and end points
            const duration = 500; // Duration of the animation in milliseconds
            const steps = 10; // Number of steps in the animation
            let step = 0;

            function stepAnimation() {
                if (step < steps) {
                    const lng = start[0] + (end[0] - start[0]) * (step / steps);
                    const lat = start[1] + (end[1] - start[1]) * (step / steps);
                    moveMarker.setLngLat([lng, lat]);
                    step++;
                    requestAnimationFrame(stepAnimation);
                } else {
                    currentWaypointIndex++;
                    animate(); // Move to the next segment
                }
            }

            stepAnimation();
        } else if (currentWaypointIndex < waypoints.length - 1) {
            // When reaching the last point of the current route segment, move to the next waypoint
            currentWaypointIndex++;
            animate(); // Continue animation to the next segment
        } else {
            // Animation complete
            console.log("Reached the final destination!");
        }
    }

    animate(); // Start the animation
}

navigator.geolocation.getCurrentPosition(initializeMap);