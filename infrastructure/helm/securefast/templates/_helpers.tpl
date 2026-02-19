{{/*
Expand the name of the chart.
*/}}
{{- define "securefast.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "securefast.fullname" -}}
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
{{- define "securefast.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "securefast.labels" -}}
helm.sh/chart: {{ include "securefast.chart" . }}
{{ include "securefast.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "securefast.selectorLabels" -}}
app.kubernetes.io/name: {{ include "securefast.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Redis labels
*/}}
{{- define "securefast.redis.labels" -}}
{{ include "securefast.labels" . }}
app.kubernetes.io/component: redis
{{- end }}

{{/*
API labels
*/}}
{{- define "securefast.api.labels" -}}
{{ include "securefast.labels" . }}
app.kubernetes.io/component: api
{{- end }}

{{/*
Worker labels
*/}}
{{- define "securefast.worker.labels" -}}
{{ include "securefast.labels" . }}
app.kubernetes.io/component: worker
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "securefast.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "securefast.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Redis URL
*/}}
{{- define "securefast.redisUrl" -}}
{{- if .Values.global.redisUrl }}
{{- .Values.global.redisUrl }}
{{- else }}
{{- printf "redis://%s-redis:6379/0" (include "securefast.fullname" .) }}
{{- end }}
{{- end }}
