export namespace main {
	
	export class SteamProfile {
	    XMLName: xml.Name;
	    SteamID64: string;
	    SteamID: string;
	    OnlineState: string;
	    StateMessage: string;
	    AvatarIcon: string;
	    AvatarMedium: string;
	    AvatarFull: string;
	    RealName: string;
	    Summary: string;
	    // Go type: struct { GameName string "xml:\"gameName\""; GameLink string "xml:\"gameLink\""; GameIcon string "xml:\"gameIcon\""; GameLogo string "xml:\"gameLogo\""; GameLogoSmall string "xml:\"gameLogoSmall\"" }
	    InGameInfo: any;
	    CustomURL: string;
	    MemberSince: string;
	    Location: string;
	
	    static createFrom(source: any = {}) {
	        return new SteamProfile(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.XMLName = this.convertValues(source["XMLName"], xml.Name);
	        this.SteamID64 = source["SteamID64"];
	        this.SteamID = source["SteamID"];
	        this.OnlineState = source["OnlineState"];
	        this.StateMessage = source["StateMessage"];
	        this.AvatarIcon = source["AvatarIcon"];
	        this.AvatarMedium = source["AvatarMedium"];
	        this.AvatarFull = source["AvatarFull"];
	        this.RealName = source["RealName"];
	        this.Summary = source["Summary"];
	        this.InGameInfo = this.convertValues(source["InGameInfo"], Object);
	        this.CustomURL = source["CustomURL"];
	        this.MemberSince = source["MemberSince"];
	        this.Location = source["Location"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace xml {
	
	export class Name {
	    Space: string;
	    Local: string;
	
	    static createFrom(source: any = {}) {
	        return new Name(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.Space = source["Space"];
	        this.Local = source["Local"];
	    }
	}

}

