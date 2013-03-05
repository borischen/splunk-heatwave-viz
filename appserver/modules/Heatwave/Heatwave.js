/*   
   Copyright 2013 Splunk Inc

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/

Splunk.Module.Heatwave = $.klass(Splunk.Module.DispatchingModule, {

    plot: function(jString){

        if (jString.length === 0){
            return;
        } else if (jString[0].count === 0){
            return;
        }

        var xoff= 100, padding= 50;

        var HeatMapPlot= this,
            data = this.parseData(jString);

        var join= this.heatMapStage.selectAll("g.col").data(data, HeatMapPlot.getMetaData),
            span= data[0]._span;

        if (span === undefined) {
            console.log("ERROR - Span is undefined!");
            return;
        }

        var svgW= parseInt(this.svg.style("width")),
            svgH= parseInt(this.svg.style("height")),
            heatMapHeight= svgH-padding,
            heatMapWidth= svgW-xoff*2;

        // Remove first column (splunk sends empty bin)
        // This is done here because xDom needs to be calculated with the first column (so that the
        // time span can be shifted in the code below.
        //data.splice(0,1);

        this.updateYScale(data, heatMapHeight);
        this.updateXScale(data, heatMapWidth, heatMapHeight);
        this.updateColorScale(data);

        var newColumns= addColumns(join);

        var bucketSpan= data[0]._bucketSpan,
            currentCols= this.heatMapStage
                .selectAll("g.col")
                .filter(inRange)
                .filter(same);

        this.heatMap.transition().duration(this.durationTime).ease("linear")
            .attr("transform", "translate(" + xoff + "," + (svgH - heatMapHeight - padding + 5) + ")");

        currentCols.each(updateRects)
            .call(move);

        this.heatMapStage.selectAll("g.cols")
            .filter(function (d) { return !inRange(d) || !same(d); })
            .transition().duration(this.durationTime)
            .attr("opacity", 0)
            .remove();

        function addColumns(d3set) {
            return d3set.enter().insert("g","g.axis").attr("class", "col")
                /*.on("mouseover", function (d) {
                    HeatMapPlot.onXAxisMouseOver(this, HeatMapPlot, d); })
                .on("mouseout", function (d) {
                    HeatMapPlot.onXAxisMouseOut(this, HeatMapPlot, d);})*/
                .call(moveIn);
        }

        function updateRects(colData) {
            var rect= d3.select(this).selectAll("rect"),
                join= rect.data(colData, HeatMapPlot.getBucket);

            join.enter().insert("rect")
                .on("mouseover", function(d){
                    d3.select(this).style("fill", "lightblue").classed("selected", true);
                    //HeatMapPlot.onYAxisMouseOver(null, HeatMapPlot, HeatMapPlot.getBucket(d));
                })
                .on("click", function(){
                    var metaData = d3.select(this).select("title").text(), //There should be better solution like this.parent.data()._time?
                        epoch= HeatMapPlot.metaTimeToEpoch(HeatMapPlot.parseMetaData(metaData));
                    HeatMapPlot.setMetaData(epoch, epoch + span);
                })
                .call(place)
                .call(shape)
                //.style("stroke","white") Instead of padding each column a stroke can be used.
                .append("title")
                .call(title, colData);

            join.on("mouseout", function(d){
                d3.select(this).style("fill", toColor(d)).classed("selected", false);
                //HeatMapPlot.onYAxisMouseOut(null, HeatMapPlot, HeatMapPlot.getBucket(d));
            });

            join.transition().duration(this.durationTime).ease("linear")
                .style("fill", toColor)
                .call(place)
                .call(shape)
                .select("title")
                .call(title, colData);

            join.exit().remove();
        }

        function title(selection, colData) {
            selection
                .text(function(d) {return colData._time + ":" + d;})
        }

        function toColor(d) {
            return HeatMapPlot.colorScale(HeatMapPlot.getValue(d) + HeatMapPlot.colorOffset);
        }

        function inRange(d) {
            return d._time >= HeatMapPlot.xDom[0] && d._time <= HeatMapPlot.xDom[1];
        }

        function same(d) {
            return d._span === span && d._bucketSpan === bucketSpan;
        }

        function move(selection) {
            selection
                .transition().duration(HeatMapPlot.durationTime).ease("linear")
                .attr("transform", function (d) { return "translate(" + HeatMapPlot.xScale(d._time) + ",0)"; })
                .attr("opacity", 1);
        }

        function moveIn(selection) {
            selection
                .attr("opacity", 0)
                .attr("transform", function (d) { return "translate(" + HeatMapPlot.xScale(d._time) + ",0)"; });
        }

        function shape(selection) {
            selection
                .attr("width", HeatMapPlot.bucketWidth)
                .attr("height", HeatMapPlot.bucketHeight)
                .style("fill", toColor);
            //.style("stroke", toColor)
            //.style("stroke-width",1)
        }

        function place(selection) {
            selection
                .attr("y", function(d) {
                    return HeatMapPlot.yScale(HeatMapPlot.getBucket(d));
                });
        }

        //HeatMapPlot.xScale= xScale;
    },

    clearPlot: function() {
        this.heatMapStage.selectAll("g.col").remove();
        this.xDom= null;

    },

    argmax: function(arr) {
        var lengths= arr.map(function (d) { return d.length; });
        return lengths.indexOf(d3.max(lengths))
    },

    calculateYDomain: function(data){
        return data[this.argmax(data)].map(function (d) {return d[0];});
        //var that= this;
        //return [d3.min(data, function (colData) { return that.getBucket(colData[0])[0]; }), //selectAll rect?
        //    d3.max(data, function (colData) { return that.getBucket(colData[colData.length-1])[1]; })];
    },

    calculateYScale: function(domain, height){
        return d3.scale.ordinal().domain(domain).rangeBands([height, 0]);
        //return d3.scale.linear().domain(domain).range([height, 0]);
    },

    updateYScale: function(data, height){
        var yDom= this.calculateYDomain(data),
            nBuckets= d3.max(data, function (d) { return d.length; }); //(yDom[1]-yDom[0])/d3.max(data, function (d) { return d._bucketSpan; });

        this.bucketHeight= height / (nBuckets);

        this.yScale= this.calculateYScale(yDom, height);

        var yAxis= d3.svg.axis()
            .scale(this.yScale)
            .orient("left")
            .ticks(Math.min(nBuckets,10))
            .tickSubdivide(0)
            .tickSize(6,3,3);

        var axis= this.heatMap.select("g.axis.y").transition().duration(this.durationTime).ease("linear")
            .call(yAxis);

        var that= this;
        this.heatMap.select("g.axis.y").selectAll("text")
            .on("mouseover", function (d) { that.onYAxisMouseOver(this, that, d); })
            .on("mouseout", function (d) { that.onYAxisMouseOut(this, that, d); })
            .on("click", function (d) { that.drillDownOnYAxisField(d); });
    },

    onYAxisMouseOver: function (selection, that, d) {
        d3.select(selection).attr("class", "selected");

        that.appendSelectionLine(that,
            that.xScale(that.xDom[0]),
            that.xScale(that.xDom[1]),
            that.yScale(d),
            that.yScale(d));

        that.appendSelectionLine(that,
            that.xScale(that.xDom[0]),
            that.xScale(that.xDom[1]),
            that.yScale(d) + that.bucketHeight,
            that.yScale(d) + that.bucketHeight);
    },

    onYAxisMouseOut: function (selection, that, d) {
        d3.select(selection).attr("class","");
        that.heatMap.selectAll("line.selection").remove();
    },

    onXAxisMouseOver: function (selection, that, d) {
        d3.select(selection).classed("selected", true);

        that.appendSelectionLine(that,
            that.xScale(d._time),
            that.xScale(d._time),
            0,
            that.yScale(""));

        that.appendSelectionLine(that,
            that.xScale(d._time) + that.bucketWidth,
            that.xScale(d._time) + that.bucketWidth,
            0,
            that.yScale(""));
    },

    onXAxisMouseOut: function (selection, that, d) {
        d3.select(selection).classed("selected",false);
        that.heatMap.selectAll("line.selection").remove();
    },

    appendSelectionLine: function(that, x1,x2,y1,y2) {
        that.heatMap.append("line")
            .attr("x1", x1)
            .attr("x2", x2)
            .attr("y1", y1)
            .attr("y2", y2)
            .attr("class", "selection");
    },

    updateXScale: function(data, width, height) {

        this.updateXDom(data);

        // leave 1 pixel for space between columns
        var nColumns= (this.xDom[1].getTime() - this.xDom[0].getTime()) / (data[0]._span * 1000);
        this.bucketWidth = (width / nColumns)-1;

        this.xScale= this.calculateXScale(this.xDom, width);

        var xAxis= d3.svg.axis()
            .scale(this.xScale)
            .orient("bottom")
            .ticks(10)
            .tickSubdivide(nColumns / 9)
            .tickSize(6,3,3);

        this.heatMap.select("g.axis.x").transition().duration(this.durationTime).ease("linear")
            .attr("transform", "translate(0," + (height) + ")")
            .call(xAxis);

    },

    addTime: function(date, time) {
        return new Date(date.getTime() + time);
    },

    shiftXDomain: function(time) {
        this.xDom[1]= this.addTime(this.xDom[1], time);
        this.xDom[0]= this.addTime(this.xDom[0], time);
    },

    updateXDom: function(data){
        var newXDom= d3.extent(data, this.getTime);

        if (!this.xDom)
        {
            this.xDom= newXDom;

            // Shift the xDomain 1 column to the right.
            this.shiftXDomain(data[0]._span * 1000);
        }
        else
        {
            // Include more data
            if (newXDom[0] < this.xDom[0]){
                this.xDom[0]= newXDom[0];
            }

            // Sift if realtime data appears
            if (newXDom[1] > this.xDom[1]){
                var time= newXDom[1].getTime() - this.xDom[1].getTime();
                this.shiftXDomain(time);
            }
        }
    },

    calculateXScale: function(domain, width) {
        return d3.time.scale().domain(domain).range([0, width]);
    },

    updateColorScale: function(data) {
        var colorDom= [d3.min(data, function (d) { return d._extent[0]; }) + this.colorOffset,
            d3.max(data, function (d){ return d._extent[1]; }) + this.colorOffset];

        this.colorScale= d3.scale.log().domain(colorDom).range(["white","#CC0000"]);
    },

    calcTimeLowerBound: function(time, length, size, span) {
        time = time.getTime();
        var date = time - (length / size) * span * 1000;
        return new Date(date);
    },

    getTime: function (d) {
        return d._time;
    },

    getMetaData: function (d) {
        return d._time + "," + d._span;
    },

    toTime: function (t){
        var st= t.indexOf("=");
        return (t.substring(st+1))
    },

    getBucketFromStr: function (str){
        var dash= str.indexOf("-");
        return [parseFloat(str.substring(0,dash)), parseFloat(str.substring(dash+1))];
    },

    getBucket: function (d) {
        return d[0];
    },

    getValue: function (d) {
        return d[1];
    },

    isNum: function(n) {
        return !isNaN(parseFloat(n)) && isFinite(n);
    },

    parseData: function(jString) {
        var data= [];
        //sort data according to bucket values
        for(var col=0; col<jString.length; col++){
            var tmp= [];
            for(var bucket in jString[col]){
                if(jString[col].hasOwnProperty(bucket) && bucket[0] !== "_"){
                    var tmpBucket= bucket;//=this.getBucketFromStr(bucket);
                    tmp.push([tmpBucket, parseFloat(jString[col][bucket])]);
                }
            }
            tmp._time= new Date(jString[col]._time);
            tmp._span= eval(jString[col]._span);
            tmp._extent= d3.extent(tmp, this.getValue);
            //var firstBucket= tmp[0][0];
            tmp._bucketSpan= "None";//firstBucket[1]-firstBucket[0];
            data.push(tmp);
        }
        return data;
    },

    getTimeRange: function() {
        return this.getContext().get("search").getTimeRange();
    },

    getSID: function() {
        return this.getContext().get("search").job.getSID();
    },

    //############################################################
    // MAIN WAVE RENDERING
    //############################################################

    initialize: function($super, container) {
        this.svg= d3.select(container).select("svg");
        this.heatMap= this.svg.append("g")
            .attr("class","heatMap");
        this.heatMapStage= this.heatMap.append("g")
            .attr("class","heatMapStage");

        this.heatMap.append("g")
            .attr("class", "axis x");

        this.heatMap.append("g")
            .attr("class", "axis y");

        this.durationTime = 500;
        this.colorOffset= 1;

        $super(container);

        this.yAxisField = "";
        //Time range parameters
        this.epochTimeRange;
        //Context flow gates
        this.doneUpstream = false;
        this.gettingResults = false;
        this.sid= this.getSID();
    },

    drillDownOnYAxisField: function(d){
        this.yAxisField = d;
        this.setMetaData();
    },

    parseMetaData: function(metaData){
        var pattern = /([^\(]+)/;
        var time = metaData.split(pattern);
        return time[1];
    },

    parseSearchField: function(searchString){
        var pattern = /([^by]*)$/;
        var endOfSearchString = searchString.toString().split(pattern);
        var arrayOfWords = endOfSearchString[1].split(" ");
        var field = arrayOfWords[1]
        return field;
    },

    parseSearchPattern: function(pattern, searchString){
        var newSearch = searchString.toString().split(pattern);
        return newSearch[1];
    },

    parseSearchString: function(searchString){
        var pattern1 = /^(.+)(?=\|[\s?]`heatwave)/; // [\s?] space is optional between the | and w/e comes after.
        var pattern2 = /^(.+)(?=\|[\s?]timechart)/;
        if(searchString.toString().indexOf("`heatwave") !== -1){
            return this.parseSearchPattern(pattern1, searchString);
        }
        if(searchString.toString().indexOf("timechart") !== -1){
            return this.parseSearchPattern(pattern2, searchString);
        }
        return searchString;
    },

    metaTimeToEpoch: function(metaData){
        var newDate = new Date(metaData.toString());
        return newDate.getTime()/1000.0;
    },

    setMetaData: function(epochStart, epochEnd){
        this.epochTimeRange = new Splunk.TimeRange(epochStart, epochEnd);

        var context = this.getContext(),
            search = context.get("search"),
            newSearch = this.parseSearchString(search),
            groupByField = this.parseSearchField(search);

        search.abandonJob();

        //Get the right time range.
        if(typeof this.epochTimeRange !== "undefined"){
            var searchRange  = this.epochTimeRange;
        }else{
            var searchRange = search.getTimeRange();
        }

        //Get right search ending.
        var drilldownSearch = newSearch.concat("| search "+groupByField+"=\""+this.yAxisField+"\"");

        search.setBaseSearch(drilldownSearch);
        search.setTimeRange(searchRange);
        console.log(search);
        context.set("search", search);

        if(this.doneUpstream && !(this.gettingResults)){
            this.pushContextToChildren(context);
        }
    },

    onJobDone: function(){
        this.getResults();
    },

    onJobProgress: function(event) {
        var context = this.getContext();
        var search  = context.get("search");
        if ((search.job.getResultCount() > 0) && (search.job.isPreviewable())) {
            this.getResults();
        }
    },
    
    getResultURL: function(params) {
        var context = this.getContext();
        var search = context.get("search");
        var searchJobId = search.job.getSearchId();

        var uri = Splunk.util.make_url("splunkd/search/jobs/" + searchJobId + "/results_preview?output_mode=json");
        return uri;
    },

    getResults: function($super) {
        this.doneUpstream = true;
        this.gettingResults = true;
        return $super();
    },

    onBeforeJobDispatched: function(search) {
        search.setMinimumStatusBuckets(1);
        search.setRequiredFields(["*"]);
    },

    getResultParams: function($super) {
        var params = $super();
        var context = this.getContext();
        var search = context.get("search");
        var sid = search.job.getSearchId();

        if (!sid) this.logger.error(this.moduleType, "Assertion Failed.");

        params.sid = sid;
        return params;
    },

    getModifiedContext: function() {
        return this.getContext();
    },

    onContextChange: function() {
        var context = this.getContext();
        if (context.get("search").job.isDone()) {
            this.getResults();
        } else {
            this.doneUpstream = false;
        }
    },

    pushContextToChildren: function($super, explicitContext){
        return $super(explicitContext);
    },

    renderResults: function($super, jString) {
        if (!jString) {
            return;
        }

        var resultDict;
        if (jString.results === undefined){
            resultsDict = eval(jString);
        }else{
            resultsDict = jString.results;
        }
        var newSID= this.getSID();
        if ((this.sid) && (this.sid !== newSID)){
            this.clearPlot();
        }
        this.sid= newSID;

        var that= this;
        $("document").ready(function() {
            that.plot(resultsDict);
        });

        this.gettingResults = false;
    },

    isReadyForContextPush: function($super) {
        if (!(this.doneUpstream)) {
            return Splunk.Module.DEFER;
        }
        if (this.gettingResults) {
            return Splunk.Module.DEFER;
        }
        return Splunk.Module.CONTINUE;
    }
});
