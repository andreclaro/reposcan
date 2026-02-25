{{/*
Expand the name of the chart.
*/}}
{{- define "reposcan.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "reposcan.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "reposcan.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "reposcan.labels" -}}
helm.sh/chart: {{ include "reposcan.chart" . }}
{{ include "reposcan.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "reposcan.selectorLabels" -}}
app.kubernetes.io/name: {{ include "reposcan.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Redis labels
*/}}
{{- define "reposcan.redis.labels" -}}
{{ include "reposcan.labels" . }}
app.kubernetes.io/component: redis
{{- end }}

{{/*
API labels
*/}}
{{- define "reposcan.api.labels" -}}
{{ include "reposcan.labels" . }}
app.kubernetes.io/component: api
{{- end }}

{{/*
Worker labels
*/}}
{{- define "reposcan.worker.labels" -}}
{{ include "reposcan.labels" . }}
app.kubernetes.io/component: worker
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "reposcan.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "reposcan.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Redis URL
*/}}
{{- define "reposcan.redisUrl" -}}
{{- if .Values.global.redisUrl }}
{{- .Values.global.redisUrl }}
{{- else }}
{{- printf "redis://%s-redis:6379/0" (include "reposcan.fullname" .) }}
{{- end }}
{{- end }}
