export class Messages
{
    private data : any;
    private type : string;

    constructor(rtype : string, rdata : any)
    {
       this.data = rdata;
       this.type = rtype;
       if (!this.data || !this.type)
            throw new Error("Invalid message creation");
    }

    getData() : any
    {
        return (this.data);
    }

    getType() : string
    {
        return (this.type);
    }
}