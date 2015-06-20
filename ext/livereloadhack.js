(function() {
    try {
        var liveReload = document.createElement('script');
        liveReload.src = "http://" + (location.host || "localhost").split(":")[0] + ":35729/livereload.js?snipver=1";
        document.body.appendChild(liveReload);
    } catch(e) {
        console.log("LiveReload not running, skipping script injection....");
    }
}());
