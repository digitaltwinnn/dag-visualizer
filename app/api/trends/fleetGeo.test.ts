import { describe, it, expect } from "vitest";
import { fleetGeo } from "./fleetGeo";

describe("fleetGeo", () => {
  it("counts the fleet by city and provider as the cards count nodes, in segments a series can carry", () => {
    const dagGeo = {
      "1.1.1.1": { cc: "DE", city: "Falkenstein", isp: "Hetzner Online GmbH" },
      "1.1.1.2": { cc: "DE", city: "Falkenstein", isp: "Hetzner Online GmbH" },
    };
    const metaGeo = {
      "1.1.1.1": { cc: "DE", city: "Falkenstein", isp: "Hetzner Online GmbH" }, // runs for both: two nodes
      "2.2.2.2": { cc: "US", city: "St. Louis", isp: "Hetzner Online GmbH" },
      "3.3.3.3": { cc: "US", isp: "Hetzner Online GmbH" }, // no city: no site
      "4.4.4.4": { cc: "US", city: "Boston" }, // no provider: no site
    };
    const metagraphs = [{ id: "dor", nodes: Object.keys(metaGeo).map((ip) => ({ ip })) }];
    expect(fleetGeo(dagGeo, metagraphs, metaGeo).sites).toEqual({
      "DE.Falkenstein.hetzner-online-gmbh": 3,
      "US.St%2E%20Louis.hetzner-online-gmbh": 1,
    });
  });
  const dagGeo = {
    "1.1.1.1": { cc: "DE", isp: "Hetzner Online GmbH" },
    "2.2.2.2": { cc: "US", isp: "Amazon.com, Inc." },
    "3.3.3.3": { cc: "DE" }, // host unknown
  };
  const metaGeo = {
    "1.1.1.1": { cc: "DE", isp: "Hetzner Online GmbH" }, // a hybrid: also a validator
    "4.4.4.4": { cc: "FI", isp: "Hetzner Online GmbH" },
  };
  const metagraphs = [
    { id: "dor", nodes: [{ ip: "1.1.1.1" }, { ip: "4.4.4.4" }, { ip: "9.9.9.9" } /* not geolocated */] },
    { id: "evi", nodes: [{ ip: "2.2.2.2" }, {}] },
  ];

  it("counts the fleet by IP ONCE — the same rule as the stored f.cc.<cc> gauge", () => {
    const g = fleetGeo(dagGeo, metagraphs, metaGeo);
    expect(g.countries).toEqual({ DE: 2, US: 1, FI: 1 });
    expect(g.providers).toEqual({ "hetzner-online-gmbh": 2, "amazon-com-inc": 1 });
  });

  it("counts each network's own nodes, the DAG's validators included", () => {
    const g = fleetGeo(dagGeo, metagraphs, metaGeo);
    expect(g.perNetCountries.dag).toEqual({ DE: 2, US: 1 });
    expect(g.perNetCountries.dor).toEqual({ DE: 1, FI: 1 });
    // A metagraph node only the validator scan geolocated still counts (the maps are merged).
    expect(g.perNetCountries.evi).toEqual({ US: 1 });
    expect(g.perNetProviders.dor).toEqual({ "hetzner-online-gmbh": 2 });
    expect(g.perNetProviders.dag).toEqual({ "hetzner-online-gmbh": 1, "amazon-com-inc": 1 });
  });

  it("names every provider key it counted, in the lookup's own words", () => {
    const g = fleetGeo(dagGeo, metagraphs, metaGeo);
    expect(g.providerNames).toEqual({ "hetzner-online-gmbh": "Hetzner Online GmbH", "amazon-com-inc": "Amazon.com, Inc." });
  });

  it("leaves a network with no geolocated node out rather than writing it an empty map", () => {
    const g = fleetGeo({}, [{ id: "ghost", nodes: [{ ip: "8.8.8.8" }] }], {});
    expect(g.perNetCountries).toEqual({});
    expect(g.perNetProviders).toEqual({});
  });
});
