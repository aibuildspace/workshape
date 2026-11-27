import { seedPilotProfiles } from "../src/lib/pilot";

console.table(seedPilotProfiles().map(({ name, role, profile_key }) => ({ profile: profile_key, name, role })));
