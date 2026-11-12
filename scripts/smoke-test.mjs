import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";

const baseUrl = process.env.APP_URL ?? "http://localhost:3000";
const password = "CI-HamPajuh-Password-2026";

function cookieFrom(response) {
  const values = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : [response.headers.get("set-cookie") ?? ""];
  return values
    .filter(Boolean)
    .map((value) => value.split(";")[0])
    .join("; ");
}

async function request(path, options = {}) {
  return fetch(new URL(path, baseUrl), {
    ...options,
    headers: {
      origin: baseUrl,
      ...(options.headers ?? {})
    }
  });
}

async function register(label) {
  const response = await request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: label,
      email: `${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${randomUUID()}@example.test`,
      password,
      callbackURL: "/"
    })
  });

  const body = await response.json().catch(() => ({}));
  assert.equal(
    response.status,
    200,
    `Sign-up should return HTTP 200; got ${response.status}: ${JSON.stringify(body)}`
  );

  const cookie = cookieFrom(response);
  assert.ok(cookie, "Sign-up should set a session cookie.");
  return cookie;
}

async function createProject(cookie, visibility, title) {
  const response = await request("/api/projects", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie
    },
    body: JSON.stringify({
      title,
      summary: "یک پروژه آزمایشی برای بررسی مسیرهای API و مجوزها.",
      disciplineSlug: "software",
      visibility
    })
  });

  const body = await response.json().catch(() => ({}));
  assert.equal(
    response.status,
    201,
    `Project creation should return HTTP 201; got ${response.status}: ${JSON.stringify(body)}`
  );
  assert.ok(body.project?.id, "The API should return the created project's identifier.");
  return body.project;
}

async function main() {
  const anonymousCreate = await request("/api/projects", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      title: "Anonymous project attempt",
      summary: "This request must be rejected because it has no session.",
      disciplineSlug: "software",
      visibility: "public"
    })
  });
  assert.equal(anonymousCreate.status, 401, "Anonymous project creation must be rejected.");

  const anonymousDashboard = await request("/api/my/projects");
  assert.equal(anonymousDashboard.status, 401, "Anonymous users must not access the personal project dashboard.");

  const ownerCookie = await register("HamPajuh CI Owner");
  const profileResponse = await request("/api/profile", {
    headers: { cookie: ownerCookie }
  });
  assert.equal(profileResponse.status, 200, "Authenticated users should receive an editable profile.");
  const profile = await profileResponse.json();
  assert.ok(profile.profile?.handle, "A default profile handle should be provisioned on first access.");

  const updatedProfileResponse = await request("/api/profile", {
    method: "PUT",
    headers: { "content-type": "application/json", cookie: ownerCookie },
    body: JSON.stringify({
      handle: "ci-researcher-" + randomUUID().slice(0, 6),
      headline: "پژوهشگر آزمون هم‌پژوه",
      bio: "پروفایل آزمایشی برای بررسی ذخیره و بازیابی اطلاعات.",
      location: "آزمایشگاه CI",
      website: "",
      isPublic: true,
      skills: ["TypeScript", "Drizzle ORM", "پژوهش داده", "typescript"]
    })
  });
  assert.equal(updatedProfileResponse.status, 200, "Profile updates should be saved.");
  const updatedProfile = await updatedProfileResponse.json();
  assert.equal(updatedProfile.profile?.headline, "پژوهشگر آزمون هم‌پژوه");
  assert.equal(updatedProfile.profile?.skills?.length, 3, "Skills should be saved without case-insensitive duplicates.");
  assert.ok(updatedProfile.profile.skills.includes("پژوهش داده"));

  const publicProject = await createProject(
    ownerCookie,
    "public",
    "Public CI Project " + randomUUID().slice(0, 8)
  );
  const privateProject = await createProject(
    ownerCookie,
    "private",
    "Private CI Project " + randomUUID().slice(0, 8)
  );

  const ownerProjectEdit = await request(`/api/projects/${publicProject.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie: ownerCookie },
    body: JSON.stringify({
      title: "Updated Public CI Project " + randomUUID().slice(0, 8),
      status: "active",
      summary: "پروژه آزمایشی به‌روزرسانی شده برای بررسی مجوزهای ویرایش و نمایش اطلاعات."
    })
  });
  assert.equal(ownerProjectEdit.status, 200, "Project owners should be able to update project metadata.");
  const ownerProjectEditBody = await ownerProjectEdit.json();
  assert.equal(ownerProjectEditBody.project?.status, "active");

  const ownerDashboardResponse = await request("/api/my/projects", {
    headers: { cookie: ownerCookie }
  });
  assert.equal(ownerDashboardResponse.status, 200, "Authenticated users should access their project dashboard.");
  const ownerDashboard = await ownerDashboardResponse.json();
  assert.ok(ownerDashboard.projects?.some((item) => item.id === publicProject.id), "The dashboard should include owned public projects.");
  assert.ok(ownerDashboard.projects?.some((item) => item.id === privateProject.id), "The dashboard should include owned private projects.");

  const listing = await request("/api/projects");
  assert.equal(listing.status, 200, "Public project listing should work.");
  const publicProjects = await listing.json();
  assert.ok(
    publicProjects.some((item) => item.id === publicProject.id),
    "The public project should appear in the public listing."
  );
  assert.ok(
    !publicProjects.some((item) => item.id === privateProject.id),
    "The private project must not appear in the public listing."
  );

  const publicProfilePath = "/api/profiles/" + encodeURIComponent(updatedProfile.profile.handle);
  const publicProfileResponse = await request(publicProfilePath);
  assert.equal(publicProfileResponse.status, 200, "A public profile should be readable without a login.");
  const publicProfile = await publicProfileResponse.json();
  assert.equal(publicProfile.profile?.handle, updatedProfile.profile.handle);
  assert.ok(publicProfile.profile?.skills?.includes("Drizzle ORM"), "Public portfolios should display researcher skills.");
  assert.equal(publicProfile.user?.email, undefined, "Public profiles must not expose account email addresses.");
  assert.ok(publicProfile.projects?.some((item) => item.id === publicProject.id), "Public profiles should show public projects.");
  assert.ok(!publicProfile.projects?.some((item) => item.id === privateProject.id), "Public profiles must hide private projects.");

  const profileVisibilityPayload = {
    handle: updatedProfile.profile.handle,
    headline: updatedProfile.profile.headline ?? "",
    bio: updatedProfile.profile.bio ?? "",
    location: updatedProfile.profile.location ?? "",
    website: updatedProfile.profile.website ?? "",
    isPublic: false
  };
  const hideProfileResponse = await request("/api/profile", {
    method: "PUT",
    headers: { "content-type": "application/json", cookie: ownerCookie },
    body: JSON.stringify(profileVisibilityPayload)
  });
  assert.equal(hideProfileResponse.status, 200, "Profile privacy can be disabled.");
  const hiddenProfileResponse = await request(publicProfilePath);
  assert.equal(hiddenProfileResponse.status, 404, "Private profiles must not be available through public endpoints.");

  const showProfileResponse = await request("/api/profile", {
    method: "PUT",
    headers: { "content-type": "application/json", cookie: ownerCookie },
    body: JSON.stringify({ ...profileVisibilityPayload, isPublic: true })
  });
  assert.equal(showProfileResponse.status, 200, "Profile privacy can be restored.");

  assert.ok(publicProject.slug, "Created projects should receive a public-friendly slug.");
  const publicDetailResponse = await request("/api/projects/by-slug/" + encodeURIComponent(publicProject.slug));
  assert.equal(publicDetailResponse.status, 200, "Public project details should be readable without login.");
  const publicDetail = await publicDetailResponse.json();
  assert.equal(publicDetail.project?.id, publicProject.id);

  const publicActivityResponse = await request(`/api/projects/${publicProject.id}/activity`);
  assert.equal(publicActivityResponse.status, 200, "Public project activity should be readable.");
  const initialActivity = await publicActivityResponse.json();
  assert.ok(initialActivity.events?.some((event) => event.eventType === "project.created"), "Project creation should be recorded in its activity history.");

  const privateActivityHidden = await request(`/api/projects/${privateProject.id}/activity`);
  assert.equal(privateActivityHidden.status, 404, "Private project activity must be hidden from anonymous visitors.");
  const privateActivityOwner = await request(`/api/projects/${privateProject.id}/activity`, {
    headers: { cookie: ownerCookie }
  });
  assert.equal(privateActivityOwner.status, 200, "Project members should be able to read private project activity.");

  const hiddenPrivateDetail = await request("/api/projects/by-slug/" + encodeURIComponent(privateProject.slug));
  assert.equal(hiddenPrivateDetail.status, 404, "Private project details must be hidden from anonymous visitors.");
  const ownerPrivateDetail = await request("/api/projects/by-slug/" + encodeURIComponent(privateProject.slug), {
    headers: { cookie: ownerCookie }
  });
  assert.equal(ownerPrivateDetail.status, 200, "Project owners should be able to open their private projects.");

  const ownerRequests = await request(`/api/projects/${publicProject.id}/requests`, {
    headers: { cookie: ownerCookie }
  });
  assert.equal(ownerRequests.status, 200, "Project owners should be able to review collaboration requests.");

  const collaboratorCookie = await register("HamPajuh CI Collaborator");
  const unauthorizedProjectEdit = await request(`/api/projects/${publicProject.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie: collaboratorCookie },
    body: JSON.stringify({ summary: "این تغییر نباید توسط عضو عادی پذیرفته شود." })
  });
  assert.equal(unauthorizedProjectEdit.status, 403, "Non-owners must not edit project metadata.");

  const forbiddenRequests = await request(`/api/projects/${publicProject.id}/requests`, {
    headers: { cookie: collaboratorCookie }
  });
  assert.equal(forbiddenRequests.status, 403, "Non-managers must not read collaboration requests.");

  const firstApplication = await request(`/api/projects/${publicProject.id}/join`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: collaboratorCookie },
    body: JSON.stringify({ message: "درخواست نخست برای آزمون لغو عضویت؛ تجربه TypeScript دارم." })
  });
  assert.equal(firstApplication.status, 201, "Applicants should be able to submit a collaboration request.");

  const outgoingRequests = await request("/api/my/projects", {
    headers: { cookie: collaboratorCookie }
  });
  assert.equal(outgoingRequests.status, 200);
  const outgoingData = await outgoingRequests.json();
  assert.ok(outgoingData.requests?.some((item) => item.projectId === publicProject.id), "Applicants should see pending requests in their dashboard.");

  const withdrawal = await request(`/api/projects/${publicProject.id}/join`, {
    method: "DELETE",
    headers: { cookie: collaboratorCookie }
  });
  assert.equal(withdrawal.status, 200, "Applicants should be able to withdraw their pending request.");

  const afterWithdrawal = await request(`/api/projects/${publicProject.id}/requests`, {
    headers: { cookie: ownerCookie }
  });
  const afterWithdrawalBody = await afterWithdrawal.json();
  assert.equal(afterWithdrawalBody.requests?.length, 0, "Withdrawn requests should disappear from managers' pending queues.");

  const simultaneousJoins = await Promise.all([
    request(`/api/projects/${publicProject.id}/join`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: collaboratorCookie },
      body: JSON.stringify({ message: "من تجربه کار با TypeScript و تحلیل داده دارم و هفته‌ای چند ساعت می‌توانم مشارکت کنم." })
    }),
    request(`/api/projects/${publicProject.id}/join`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: collaboratorCookie },
      body: JSON.stringify({ message: "من تجربه کار با TypeScript و تحلیل داده دارم و هفته‌ای چند ساعت می‌توانم مشارکت کنم." })
    })
  ]);
  const simultaneousResults = await Promise.all(simultaneousJoins.map(async (response) => ({
    status: response.status,
    body: await response.json().catch(() => ({}))
  })));
  assert.equal(
    simultaneousResults.filter((item) => item.status === 201).length,
    1,
    "Exactly one concurrent collaboration request should be created."
  );
  assert.equal(
    simultaneousResults.filter((item) => item.status === 200).length,
    1,
    "The competing duplicate request should be acknowledged without a second row."
  );
  const joinBody = simultaneousResults.find((item) => item.status === 201)?.body;
  assert.ok(joinBody?.requestId, "The collaboration request should have an identifier.");

  const pendingResponse = await request(`/api/projects/${publicProject.id}/requests`, {
    headers: { cookie: ownerCookie }
  });
  const pendingBody = await pendingResponse.json();
  assert.equal(pendingBody.requests?.length, 1, "The owner should see exactly one pending request.");
  assert.match(pendingBody.requests[0].message, /TypeScript/, "The applicant's collaboration message should be visible to project managers.");

  const reviewResponse = await request(
    `/api/projects/${publicProject.id}/requests/${joinBody.requestId}`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: ownerCookie },
      body: JSON.stringify({ action: "accept" })
    }
  );
  assert.equal(reviewResponse.status, 200, "The owner should be able to accept a collaboration request.");

  const collaboratorDashboard = await request("/api/my/projects", {
    headers: { cookie: collaboratorCookie }
  });
  assert.equal(collaboratorDashboard.status, 200, "Accepted contributors should access their project dashboard.");
  const collaboratorProjects = await collaboratorDashboard.json();
  assert.ok(collaboratorProjects.projects?.some((item) => item.id === publicProject.id), "The collaborator dashboard should include the accepted project.");
  assert.ok(!collaboratorProjects.projects?.some((item) => item.id === privateProject.id), "Other users' private projects must never appear in a dashboard.");

  const joinedDetailResponse = await request("/api/projects/by-slug/" + encodeURIComponent(publicProject.slug));
  const joinedDetail = await joinedDetailResponse.json();
  assert.ok(joinedDetail.members?.some((member) => member.role === "contributor"), "Accepted collaborators should become project members.");

  const collaboratorProfileResponse = await request("/api/profile", {
    headers: { cookie: collaboratorCookie }
  });
  assert.equal(collaboratorProfileResponse.status, 200);
  const collaboratorProfile = await collaboratorProfileResponse.json();
  const collaboratorId = collaboratorProfile.user.id;
 
  const anonymousTasks = await request("/api/projects/" + publicProject.id + "/tasks");
  assert.equal(anonymousTasks.status, 401, "Anonymous visitors must not read the internal task board.");

  const createdTaskResponse = await request("/api/projects/" + publicProject.id + "/tasks", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: collaboratorCookie },
    body: JSON.stringify({
      title: "بررسی داده‌های آزمایش",
      description: "یک وظیفه برای آزمون گردش کار تیم.",
      priority: "high",
      assigneeId: collaboratorId,
      dueDate: "2027-06-15"
    })
  });
  assert.equal(createdTaskResponse.status, 201, "Project contributors should be able to create tasks.");
  const createdTaskBody = await createdTaskResponse.json();
  assert.ok(createdTaskBody.task?.id, "Task creation should return a task identifier.");
  const taskId = createdTaskBody.task.id;

  const taskListResponse = await request("/api/projects/" + publicProject.id + "/tasks", {
    headers: { cookie: ownerCookie }
  });
  assert.equal(taskListResponse.status, 200, "Project managers should be able to read the task board.");
  const taskList = await taskListResponse.json();
  assert.ok(taskList.tasks?.some((task) => task.id === taskId && task.assigneeId === collaboratorId));
  assert.ok(taskList.members?.some((member) => member.userId === collaboratorId));
  const ownerId = taskList.members?.find((member) => member.role === "owner")?.userId;
  assert.ok(ownerId, "The task board should identify the project owner for the review test.");

  const forbiddenTaskEdit = await request("/api/projects/" + publicProject.id + "/tasks/" + taskId, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie: collaboratorCookie },
    body: JSON.stringify({ title: "تغییر غیرمجاز عنوان وظیفه" })
  });
  assert.equal(forbiddenTaskEdit.status, 403, "Contributors may not edit task details after creation.");

  const contributorTaskStatus = await request("/api/projects/" + publicProject.id + "/tasks/" + taskId, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie: collaboratorCookie },
    body: JSON.stringify({ status: "in_progress" })
  });
  assert.equal(contributorTaskStatus.status, 200, "An assigned contributor should be able to update task status.");
  const contributorTaskStatusBody = await contributorTaskStatus.json();
  assert.equal(contributorTaskStatusBody.task?.status, "in_progress");

  const submitTaskForReview = await request("/api/projects/" + publicProject.id + "/tasks/" + taskId, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie: collaboratorCookie },
    body: JSON.stringify({ action: "submit_for_review" })
  });
  assert.equal(submitTaskForReview.status, 200, "The task participant should be able to submit work for review.");
  const submittedTaskBody = await submitTaskForReview.json();
  assert.equal(submittedTaskBody.task?.status, "in_review");
  assert.equal(submittedTaskBody.task?.reviewSubmittedBy, collaboratorId);
  assert.ok(submittedTaskBody.task?.reviewRequestedAt);

  const contributorSelfApproval = await request("/api/projects/" + publicProject.id + "/tasks/" + taskId, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie: collaboratorCookie },
    body: JSON.stringify({ action: "approve" })
  });
  assert.equal(contributorSelfApproval.status, 403, "A contributor may not approve a task, including their own submission.");

  const requestTaskChanges = await request("/api/projects/" + publicProject.id + "/tasks/" + taskId, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie: ownerCookie },
    body: JSON.stringify({ action: "request_changes", comment: "لطفاً روش تحلیل و منبع داده‌ها را دقیق‌تر مستند کنید." })
  });
  assert.equal(requestTaskChanges.status, 200, "A project manager should be able to request documented changes.");
  const changesBody = await requestTaskChanges.json();
  assert.equal(changesBody.task?.status, "changes_requested");
  assert.equal(changesBody.task?.reviewedBy, ownerId);
  assert.match(changesBody.task?.reviewComment ?? "", /مستند/);

  const resubmitAfterChanges = await request("/api/projects/" + publicProject.id + "/tasks/" + taskId, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie: collaboratorCookie },
    body: JSON.stringify({ status: "in_progress" })
  });
  assert.equal(resubmitAfterChanges.status, 200, "The assigned contributor should be able to resume requested changes.");

  const secondTaskSubmission = await request("/api/projects/" + publicProject.id + "/tasks/" + taskId, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie: collaboratorCookie },
    body: JSON.stringify({ action: "submit_for_review" })
  });
  assert.equal(secondTaskSubmission.status, 200, "The contributor should be able to resubmit a corrected task.");

  const approveTask = await request("/api/projects/" + publicProject.id + "/tasks/" + taskId, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie: ownerCookie },
    body: JSON.stringify({ action: "approve", comment: "خروجی بررسی شد و معیارهای پذیرش رعایت شده‌اند." })
  });
  assert.equal(approveTask.status, 200, "A different project manager should be able to approve the submitted task.");
  const approvedTaskBody = await approveTask.json();
  assert.equal(approvedTaskBody.task?.status, "done");
  assert.equal(approvedTaskBody.task?.reviewedBy, ownerId);
  assert.ok(approvedTaskBody.task?.reviewedAt);
  assert.ok(approvedTaskBody.task?.completedAt);

  const contributorReopenApprovedTask = await request("/api/projects/" + publicProject.id + "/tasks/" + taskId, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie: collaboratorCookie },
    body: JSON.stringify({ status: "in_progress" })
  });
  assert.equal(contributorReopenApprovedTask.status, 403, "Only project managers may reopen a formally approved task.");

  const finalTaskListResponse = await request("/api/projects/" + publicProject.id + "/tasks", {
    headers: { cookie: ownerCookie }
  });
  const finalTaskList = await finalTaskListResponse.json();
  const finalTask = finalTaskList.tasks?.find((task) => task.id === taskId);
  assert.equal(finalTask?.status, "done");
  assert.equal(finalTask?.reviewedBy, ownerId);
  assert.match(finalTask?.reviewComment ?? "", /معیارهای پذیرش/);

  const anonymousDiscussions = await request("/api/projects/" + publicProject.id + "/discussions");
  assert.equal(anonymousDiscussions.status, 401, "Anonymous visitors must not read internal project discussions.");

  const ownerDiscussionResponse = await request("/api/projects/" + publicProject.id + "/discussions", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: ownerCookie },
    body: JSON.stringify({
      title: "بازبینی روش ارزیابی آزمایش",
      body: "لطفاً روش ارزیابی و معیارهای انتخاب‌شده را از نظر تکرارپذیری بررسی کنیم.",
      kind: "review",
      taskId
    })
  });
  assert.equal(ownerDiscussionResponse.status, 201, "Project managers should be able to create review topics.");
  const ownerDiscussionBody = await ownerDiscussionResponse.json();
  const topicId = ownerDiscussionBody.topic?.id;
  assert.ok(topicId, "Discussion creation should return a topic identifier.");

  const collaboratorDiscussions = await request("/api/projects/" + publicProject.id + "/discussions", {
    headers: { cookie: collaboratorCookie }
  });
  assert.equal(collaboratorDiscussions.status, 200, "Project members should be able to read internal discussions.");
  const collaboratorDiscussionsBody = await collaboratorDiscussions.json();
  assert.ok(
    collaboratorDiscussionsBody.topics?.some((item) => item.id === topicId && item.taskTitle === "بررسی داده‌های آزمایش"),
    "Discussion topics should expose their linked task to project members."
  );

  const collaboratorReply = await request(
    "/api/projects/" + publicProject.id + "/discussions/" + topicId + "/posts",
    {
      method: "POST",
      headers: { "content-type": "application/json", cookie: collaboratorCookie },
      body: JSON.stringify({ body: "معیارهای اصلی روشن‌اند؛ بهتر است یک آزمون تکرار مستقل هم اضافه شود." })
    }
  );
  assert.equal(collaboratorReply.status, 201, "Contributors should be able to reply to open discussions.");

  const ownerDiscussionPosts = await request(
    "/api/projects/" + publicProject.id + "/discussions/" + topicId + "/posts",
    { headers: { cookie: ownerCookie } }
  );
  assert.equal(ownerDiscussionPosts.status, 200, "Project managers should be able to read discussion replies.");
  const ownerDiscussionPostsBody = await ownerDiscussionPosts.json();
  assert.equal(ownerDiscussionPostsBody.posts?.length, 1, "Discussion replies should be returned in chronological order.");

  const resolveDiscussion = await request(
    "/api/projects/" + publicProject.id + "/discussions/" + topicId,
    {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: ownerCookie },
      body: JSON.stringify({ action: "resolve" })
    }
  );
  assert.equal(resolveDiscussion.status, 200, "Project managers should be able to resolve a discussion.");

  const replyToResolvedDiscussion = await request(
    "/api/projects/" + publicProject.id + "/discussions/" + topicId + "/posts",
    {
      method: "POST",
      headers: { "content-type": "application/json", cookie: collaboratorCookie },
      body: JSON.stringify({ body: "این پاسخ باید تا بازگشایی موضوع رد شود." })
    }
  );
  assert.equal(replyToResolvedDiscussion.status, 409, "Resolved discussions must not accept new replies.");

  const reopenDiscussion = await request(
    "/api/projects/" + publicProject.id + "/discussions/" + topicId,
    {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: ownerCookie },
      body: JSON.stringify({ action: "reopen" })
    }
  );
  assert.equal(reopenDiscussion.status, 200, "Project managers should be able to reopen a discussion.");

  const secondDiscussionReply = await request(
    "/api/projects/" + publicProject.id + "/discussions/" + topicId + "/posts",
    {
      method: "POST",
      headers: { "content-type": "application/json", cookie: collaboratorCookie },
      body: JSON.stringify({ body: "با اجرای آزمون مستقل می‌توانیم میزان پایداری نتیجه را مقایسه کنیم." })
    }
  );
  assert.equal(secondDiscussionReply.status, 201, "Members should be able to continue a reopened discussion.");

  const unauthorizedRoleChange = await request(
    `/api/projects/${publicProject.id}/members/${collaboratorId}`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: collaboratorCookie },
      body: JSON.stringify({ role: "viewer" })
    }
  );
  assert.equal(unauthorizedRoleChange.status, 403, "Only owners may change member roles.");

  const promoteMember = await request(
    `/api/projects/${publicProject.id}/members/${collaboratorId}`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: ownerCookie },
      body: JSON.stringify({ role: "maintainer" })
    }
  );
  assert.equal(promoteMember.status, 200, "Project owners should be able to promote collaborators.");
  const promotedDetailResponse = await request("/api/projects/by-slug/" + encodeURIComponent(publicProject.slug));
  const promotedDetail = await promotedDetailResponse.json();
  assert.ok(promotedDetail.members?.some((member) => member.role === "maintainer"), "Promoted members should receive the maintainer role.");

  const restoreContributor = await request(
    `/api/projects/${publicProject.id}/members/${collaboratorId}`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: ownerCookie },
      body: JSON.stringify({ role: "contributor" })
    }
  );
  assert.equal(restoreContributor.status, 200, "Project owners should be able to change a member role back.");

  const setViewer = await request(
    "/api/projects/" + publicProject.id + "/members/" + collaboratorId,
    {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: ownerCookie },
      body: JSON.stringify({ role: "viewer" })
    }
  );
  assert.equal(setViewer.status, 200, "Project owners should be able to assign the read-only viewer role.");

  const viewerDiscussionRead = await request("/api/projects/" + publicProject.id + "/discussions", {
    headers: { cookie: collaboratorCookie }
  });
  assert.equal(viewerDiscussionRead.status, 200, "Viewers may read project discussions.");

  const viewerDiscussionPosts = await request(
    "/api/projects/" + publicProject.id + "/discussions/" + topicId + "/posts",
    { headers: { cookie: collaboratorCookie } }
  );
  assert.equal(viewerDiscussionPosts.status, 200, "Viewers may read discussion replies.");

  const viewerCannotCreateDiscussion = await request("/api/projects/" + publicProject.id + "/discussions", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: collaboratorCookie },
    body: JSON.stringify({ title: "بحث مشاهده‌گر", body: "این عملیات نباید مجاز باشد.", kind: "general" })
  });
  assert.equal(viewerCannotCreateDiscussion.status, 403, "Viewers must not create discussion topics.");

  const viewerCannotReply = await request(
    "/api/projects/" + publicProject.id + "/discussions/" + topicId + "/posts",
    {
      method: "POST",
      headers: { "content-type": "application/json", cookie: collaboratorCookie },
      body: JSON.stringify({ body: "این پاسخ نباید ثبت شود." })
    }
  );
  assert.equal(viewerCannotReply.status, 403, "Viewers must not reply to discussions.");

  const viewerCannotCreateTask = await request("/api/projects/" + publicProject.id + "/tasks", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: collaboratorCookie },
    body: JSON.stringify({ title: "وظیفه با دسترسی فقط‌خواندنی" })
  });
  assert.equal(viewerCannotCreateTask.status, 403, "Viewers must not create project tasks.");

  const viewerCannotChangeTaskStatus = await request("/api/projects/" + publicProject.id + "/tasks/" + taskId, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie: collaboratorCookie },
    body: JSON.stringify({ status: "blocked" })
  });
  assert.equal(viewerCannotChangeTaskStatus.status, 403, "Viewers must not change task status.");

  const restoreContributorAfterViewer = await request(
    "/api/projects/" + publicProject.id + "/members/" + collaboratorId,
    {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: ownerCookie },
      body: JSON.stringify({ role: "contributor" })
    }
  );
  assert.equal(restoreContributorAfterViewer.status, 200, "Owners should be able to restore contributor permissions.");


  const secondJoinResponse = await request(
    `/api/projects/${publicProject.id}/join`,
    { method: "POST", headers: { cookie: collaboratorCookie } }
  );
  assert.equal(secondJoinResponse.status, 409, "Existing members must not submit another join request.");

  const ownerCannotLeave = await request(
    `/api/projects/${publicProject.id}/members/${profile.user.id}`,
    { method: "DELETE", headers: { cookie: ownerCookie } }
  );
  assert.equal(ownerCannotLeave.status, 409, "Project owners must not be able to leave without transferring ownership.");

  const collaboratorLeave = await request(
    `/api/projects/${publicProject.id}/members/${collaboratorId}`,
    { method: "DELETE", headers: { cookie: collaboratorCookie } }
  );
  assert.equal(collaboratorLeave.status, 200, "A non-owner member should be able to leave a project.");

  const afterLeaveDetailResponse = await request("/api/projects/by-slug/" + encodeURIComponent(publicProject.slug));
  const afterLeaveDetail = await afterLeaveDetailResponse.json();
  assert.ok(!afterLeaveDetail.members?.some((member) => member.role === "contributor"), "A member who leaves should be removed from the project team.");

  const afterLeaveDashboardResponse = await request("/api/my/projects", {
    headers: { cookie: collaboratorCookie }
  });
  const afterLeaveDashboard = await afterLeaveDashboardResponse.json();
  assert.ok(!afterLeaveDashboard.projects?.some((item) => item.id === publicProject.id), "A project should disappear from a user's dashboard after leaving.");
  const tasksAfterLeave = await request("/api/projects/" + publicProject.id + "/tasks", {
    headers: { cookie: collaboratorCookie }
  });
  assert.equal(tasksAfterLeave.status, 404, "Former members must lose access to the internal task board.");
  const discussionsAfterLeave = await request("/api/projects/" + publicProject.id + "/discussions", {
    headers: { cookie: collaboratorCookie }
  });
  assert.equal(discussionsAfterLeave.status, 404, "Former members must lose access to internal project discussions.");
  const discussionPostsAfterLeave = await request(
    "/api/projects/" + publicProject.id + "/discussions/" + topicId + "/posts",
    { headers: { cookie: collaboratorCookie } }
  );
  assert.equal(discussionPostsAfterLeave.status, 404, "Former members must lose access to discussion replies.");

  const finalActivityResponse = await request(`/api/projects/${publicProject.id}/activity`);
  const finalActivity = await finalActivityResponse.json();
  assert.ok(finalActivity.events?.some((event) => event.eventType === "project.member_left"), "Leaving a project should be recorded in its activity history.");
  assert.ok(finalActivity.events?.some((event) => event.eventType === "project.task_created"), "Task creation should be recorded in project activity.");
  assert.ok(finalActivity.events?.some((event) => event.eventType === "project.task_status_changed"), "Task status changes should be recorded in project activity.");
  assert.ok(finalActivity.events?.some((event) => event.eventType === "project.discussion_created"), "Discussion creation should be recorded in project activity.");
  assert.ok(finalActivity.events?.some((event) => event.eventType === "project.discussion_reply_created"), "Discussion replies should be recorded in project activity.");
  assert.ok(finalActivity.events?.some((event) => event.eventType === "project.discussion_resolved"), "Discussion resolution should be recorded in project activity.");
  assert.ok(finalActivity.events?.some((event) => event.eventType === "project.discussion_reopened"), "Discussion reopening should be recorded in project activity.");


  console.log("PASS: anonymous writes are rejected");
  console.log("PASS: signup creates authenticated sessions");
  console.log("PASS: first login provisions a profile and profile edits persist");
  console.log("PASS: public profiles expose public projects but hide private projects and account email");
  console.log("PASS: private profiles return not found to public visitors");
  console.log("PASS: authenticated users can create projects");
  console.log("PASS: private projects are excluded from public discovery and hidden project detail");
  console.log("PASS: project owners can view private projects");
  console.log("PASS: only project owners can edit project metadata");
  console.log("PASS: personal project dashboard shows only projects the user belongs to");
  console.log("PASS: only owners can promote or change project member roles");
  console.log("PASS: members can leave projects and project owners cannot leave without ownership transfer");
  console.log("PASS: project activity is private-aware and records creation and member departure");
  console.log("PASS: collaboration requests are visible only to project managers");
  console.log("PASS: owners can accept requests and add contributors to the team");
  console.log("PASS: members can create and track tasks with role-based permissions");
  console.log("PASS: member-only research discussions, task-linked reviews, replies and resolve/reopen permissions");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
