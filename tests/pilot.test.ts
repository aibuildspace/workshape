import assert from "node:assert/strict";
import test from "node:test";
import { createSession } from "../src/lib/accounts";
import { pilotActor, revokePilotSession, seedPilotProfiles, startPilotSession, switchPilotProfile } from "../src/lib/pilot";

process.env.WORKSHAPE_DB = ":memory:";

test("pilot seeding is idempotent and switching requires an active pilot admin session", () => {
  assert.equal(startPilotSession(), undefined);
  const profiles = seedPilotProfiles();
  assert.deepEqual(seedPilotProfiles(), profiles);
  const admin = profiles.find((profile) => profile.profile_key === "admin")!;
  const manager = profiles.find((profile) => profile.profile_key === "manager")!;
  const employee = profiles.find((profile) => profile.profile_key === "employee")!;
  assert.equal(employee.manager_id, manager.id);

  const regularSession = createSession(admin.id);
  assert.equal(switchPilotProfile(regularSession, "employee"), false);

  const token = startPilotSession()!;
  assert.equal(pilotActor(token)?.id, admin.id);
  assert.equal(switchPilotProfile(token, "unseeded-account"), false);
  assert.equal(switchPilotProfile(token, "employee"), true);
  assert.equal(pilotActor(token)?.id, employee.id);
  assert.equal(switchPilotProfile(token, "hr"), false);
  assert.equal(switchPilotProfile(token, "admin"), true);
  revokePilotSession(token);
  assert.equal(pilotActor(token), undefined);
  assert.equal(switchPilotProfile(token, "hr"), false);
});
